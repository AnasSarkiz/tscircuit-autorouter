import {
  type XYConnection as HgXYConnection,
  type JPort,
  type JRegion,
  ViaGraphSolver,
  type ViasByNet,
  createViaGraphWithConnections,
  generateDefaultViaTopologyGrid,
  generateDefaultViaTopologyRegions,
} from "@tscircuit/hypergraph"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { GraphicsObject } from "graphics-debug"
import { cloneAndShuffleArray } from "lib/utils/cloneAndShuffleArray"
import { getBoundsFromNodeWithPortPoints } from "lib/utils/getBoundsFromNodeWithPortPoints"
import type {
  HighDensityIntraNodeRouteWithVias,
  NodeWithPortPoints,
  PortPoint,
  ViaRegion,
} from "../../types/high-density-types"
import { BaseSolver } from "../BaseSolver"
import { safeTransparentize } from "../colors"

export type Point2D = { x: number; y: number }

export interface ViaHighDensityHyperParameters {
  /** Tile size for the via grid */
  TILE_SIZE?: number
  /** Port pitch for via topology */
  PORT_PITCH?: number
  /** Shuffle seed for connection ordering */
  SHUFFLE_SEED?: number
}

export interface ViaHighDensitySolverParams {
  nodeWithPortPoints: NodeWithPortPoints
  colorMap?: Record<string, string>
  traceWidth?: number
  hyperParameters?: ViaHighDensityHyperParameters
  connMap?: ConnectivityMap
}

interface XYConnection {
  start: { x: number; y: number }
  end: { x: number; y: number }
  connectionName: string
  rootConnectionName?: string
}

/**
 * ViaHighDensitySolver routes traces through via regions using the ViaGraphSolver
 * from @tscircuit/hypergraph. Via regions are exclusive - only one net can use
 * each via region at a time.
 *
 * This solver follows the same pattern as JumperPrepatternSolver2_HyperGraph:
 * 1. Generate via topology using createViaGraphFromXYConnections with default viasByNet
 * 2. The topology is automatically sized to fit the connection bounds
 * 3. Solve routing using ViaGraphSolver
 * 4. Track which via regions are used and filter out unused ones
 */
export class ViaHighDensitySolver extends BaseSolver {
  override getSolverName(): string {
    return "ViaHighDensitySolver"
  }

  // Input parameters
  constructorParams: ViaHighDensitySolverParams
  nodeWithPortPoints: NodeWithPortPoints
  colorMap: Record<string, string>
  traceWidth: number
  hyperParameters: ViaHighDensityHyperParameters
  connMap?: ConnectivityMap

  // Internal solver
  viaGraphSolver: ViaGraphSolver | null = null
  xyConnections: XYConnection[] = []

  // Graph bounds for visualization
  graphBounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  } | null = null

  // All via region info from the generated topology
  viaRegionInfo: Array<{
    viaRegionId: string
    region: JRegion
  }> = []

  // All routing regions (via regions + outer frame regions) for visualization
  allRoutingRegions: Array<{
    regionId: string
    region: JRegion
    isViaRegion: boolean
  }> = []

  // Default via diameter from tiledViasByNet (typically 0.6)
  defaultViaDiameter: number = 0.6

  // Track which via regions are used by which connections
  viaRegionUsage: Map<string, Set<string>> = new Map()

  // Output
  solvedRoutes: HighDensityIntraNodeRouteWithVias[] = []

  // Via regions with connectivity info (filtered after solving)
  vias: ViaRegion[] = []

  // Tiled vias by net from topology generation
  tiledViasByNet: ViasByNet = {}

  constructor(params: ViaHighDensitySolverParams) {
    super()
    this.constructorParams = params
    this.nodeWithPortPoints = params.nodeWithPortPoints
    this.colorMap = params.colorMap ?? {}
    this.traceWidth = params.traceWidth ?? 0.15
    this.hyperParameters = params.hyperParameters ?? {}
    this.connMap = params.connMap
    this.MAX_ITERATIONS = 1e6

    // Initialize colorMap if not provided
    if (Object.keys(this.colorMap).length === 0) {
      this.colorMap = this._buildColorMap()
    }
  }

  getConstructorParams(): ViaHighDensitySolverParams {
    return this.constructorParams
  }

  private _buildColorMap(): Record<string, string> {
    const colors = [
      "#e6194b",
      "#3cb44b",
      "#ffe119",
      "#4363d8",
      "#f58231",
      "#911eb4",
      "#46f0f0",
      "#f032e6",
      "#bcf60c",
      "#fabebe",
    ]
    const colorMap: Record<string, string> = {}
    const connectionNames = new Set<string>()
    for (const pp of this.nodeWithPortPoints.portPoints) {
      connectionNames.add(pp.connectionName)
    }
    let i = 0
    for (const name of Array.from(connectionNames)) {
      colorMap[name] = colors[i % colors.length]
      i++
    }
    return colorMap
  }

  private _initializeGraph(): boolean {
    const node = this.nodeWithPortPoints

    // Calculate node bounds
    const nodeBounds = {
      minX: node.center.x - node.width / 2,
      maxX: node.center.x + node.width / 2,
      minY: node.center.y - node.height / 2,
      maxY: node.center.y + node.height / 2,
    }
    this.graphBounds = nodeBounds

    // Build connections from port points
    // Group port points by connection name
    const connectionMap = new Map<
      string,
      { points: PortPoint[]; rootConnectionName?: string }
    >()
    for (const pp of node.portPoints) {
      const existing = connectionMap.get(pp.connectionName)
      if (existing) {
        existing.points.push(pp)
      } else {
        connectionMap.set(pp.connectionName, {
          points: [pp],
          rootConnectionName: pp.rootConnectionName,
        })
      }
    }

    // Create XY connections
    this.xyConnections = []
    for (const [connectionName, data] of Array.from(connectionMap.entries())) {
      if (data.points.length < 2) continue

      // Optionally shuffle points based on seed
      let points = data.points
      if (this.hyperParameters.SHUFFLE_SEED !== undefined) {
        points = cloneAndShuffleArray(points, this.hyperParameters.SHUFFLE_SEED)
      }

      this.xyConnections.push({
        connectionName,
        rootConnectionName: data.rootConnectionName,
        start: { x: points[0].x, y: points[0].y },
        end: { x: points[points.length - 1].x, y: points[points.length - 1].y },
      })
    }

    if (this.xyConnections.length === 0) {
      this.solved = true
      return true
    }

    // Convert to hypergraph XYConnection format
    const hgXyConnections: HgXYConnection[] = this.xyConnections.map(
      (conn) => ({
        connectionId: conn.connectionName,
        start: conn.start,
        end: conn.end,
      }),
    )

    // Generate via topology grid using node bounds (not connection bounds)
    // This ensures the via grid covers the full routing area
    const viaTopology = generateDefaultViaTopologyGrid({
      bounds: nodeBounds,
      tileSize: this.hyperParameters.TILE_SIZE,
      portPitch: this.hyperParameters.PORT_PITCH,
    })

    // Create the via graph with connections attached
    const result = createViaGraphWithConnections(
      {
        regions: viaTopology.regions,
        ports: viaTopology.ports,
      },
      hgXyConnections,
    )

    this.tiledViasByNet = viaTopology.tiledViasByNet

    // Extract default via diameter from tiledViasByNet (typically 0.6)
    const firstNetVias = Object.values(this.tiledViasByNet)[0]
    if (firstNetVias && firstNetVias.length > 0) {
      this.defaultViaDiameter = firstNetVias[0].diameter
    }

    // Collect via region info (we'll determine via positions from route paths)
    this.viaRegionInfo = []
    // Collect all routing regions for visualization (via regions + outer frame regions)
    this.allRoutingRegions = []
    for (const region of result.regions) {
      // Skip connection pseudo-regions (they're just for connecting to the graph)
      if (region.regionId?.startsWith("conn:")) continue

      if (region.d?.isViaRegion) {
        this.viaRegionInfo.push({
          viaRegionId: region.regionId,
          region,
        })
        this.allRoutingRegions.push({
          regionId: region.regionId,
          region,
          isViaRegion: true,
        })
      } else {
        // Outer frame region (T, B, L, R)
        this.allRoutingRegions.push({
          regionId: region.regionId,
          region,
          isViaRegion: false,
        })
      }
    }

    // Create the ViaGraphSolver
    this.viaGraphSolver = new ViaGraphSolver({
      inputGraph: {
        regions: result.regions,
        ports: result.ports,
      },
      inputConnections: result.connections,
      viasByNet: this.tiledViasByNet,
    })

    return true
  }

  _step() {
    // Initialize on first step
    if (!this.viaGraphSolver) {
      this._initializeGraph()
      if (this.solved) return
      if (!this.viaGraphSolver) {
        this.failed = true
        return
      }
    }

    // Set activeSubSolver for visualization
    this.activeSubSolver = this.viaGraphSolver

    // Step the ViaGraphSolver
    this.viaGraphSolver.step()

    if (this.viaGraphSolver.solved) {
      this._processResults()
      this.solved = true
    } else if (this.viaGraphSolver.failed) {
      this.error = this.viaGraphSolver.error
      this.failed = true
    }
  }

  /**
   * Build a lookup table of all via positions from tiledViasByNet
   */
  private _buildViaPositionLookup(): Array<{
    viaId: string
    netId: string
    position: { x: number; y: number }
    diameter: number
  }> {
    const lookup: Array<{
      viaId: string
      netId: string
      position: { x: number; y: number }
      diameter: number
    }> = []

    for (const [netId, vias] of Object.entries(this.tiledViasByNet)) {
      for (const via of vias) {
        lookup.push({
          viaId: via.viaId,
          netId,
          position: via.position,
          diameter: via.diameter,
        })
      }
    }

    return lookup
  }

  /**
   * Find the closest via position to a given port
   */
  private _findClosestVia(
    port: JPort,
    viaLookup: ReturnType<typeof this._buildViaPositionLookup>,
  ): { position: { x: number; y: number }; diameter: number } | null {
    let closest = null
    let minDist = Infinity

    for (const via of viaLookup) {
      const dist = Math.sqrt(
        (via.position.x - port.d.x) ** 2 + (via.position.y - port.d.y) ** 2,
      )
      if (dist < minDist) {
        minDist = dist
        closest = via
      }
    }

    // Only return if the via is reasonably close (within 1mm)
    if (closest && minDist < 1) {
      return { position: closest.position, diameter: closest.diameter }
    }

    return null
  }

  /**
   * Process the solved routes from ViaGraphSolver and build output.
   * Vias are placed at actual via positions (from tiledViasByNet) when routes traverse via regions.
   */
  private _processResults() {
    if (!this.viaGraphSolver) return

    // Track which via regions are used by which connections
    this.viaRegionUsage = new Map()

    // Build via position lookup
    const viaLookup = this._buildViaPositionLookup()

    // Track all vias placed (keyed by position for deduplication)
    const viasByPosition: Map<
      string,
      {
        center: { x: number; y: number }
        diameter: number
        connectedTo: Set<string>
      }
    > = new Map()

    for (const solvedRoute of this.viaGraphSolver.solvedRoutes) {
      const connectionName = solvedRoute.connection.connectionId
      const xyConn = this.xyConnections.find(
        (c) => c.connectionName === connectionName,
      )
      const rootConnectionName = xyConn?.rootConnectionName

      // Build route points from the solved path
      const routePoints: Array<{ x: number; y: number; z: number }> = []
      const usedViaRegions: ViaRegion[] = []

      // Track via region traversals to place entry and exit vias
      let currentViaRegion: JRegion | null = null
      let viaEntryPort: JPort | null = null

      for (let i = 0; i < solvedRoute.path.length; i++) {
        const candidate = solvedRoute.path[i]
        const port = candidate.port as JPort
        const lastRegion = candidate.lastRegion as JRegion | undefined

        // Add the port position as a route point
        routePoints.push({
          x: port.d.x,
          y: port.d.y,
          z: 0,
        })

        // Check if we just passed through a via region
        if (lastRegion?.d?.isViaRegion) {
          const regionId = lastRegion.regionId

          if (!this.viaRegionUsage.has(regionId)) {
            this.viaRegionUsage.set(regionId, new Set())
          }
          this.viaRegionUsage.get(regionId)!.add(connectionName)

          // Check if we're entering a new via region
          if (
            !currentViaRegion ||
            currentViaRegion.regionId !== lastRegion.regionId
          ) {
            // If we were in a different via region, place exit via for that one
            if (currentViaRegion && viaEntryPort) {
              // Place exit via at the previous port (where we exited the old region)
              const exitPort = candidate.lastPort as JPort | null
              if (exitPort) {
                const viaInfo = this._findClosestVia(exitPort, viaLookup)
                if (viaInfo) {
                  this._addViaAtPosition(
                    viasByPosition,
                    viaInfo.position,
                    viaInfo.diameter,
                    connectionName,
                    usedViaRegions,
                    currentViaRegion.regionId,
                  )
                }
              }
            }

            // Start tracking new via region
            currentViaRegion = lastRegion
            viaEntryPort = candidate.lastPort as JPort | null

            // Place entry via (going down to bottom layer)
            if (viaEntryPort) {
              const viaInfo = this._findClosestVia(viaEntryPort, viaLookup)
              if (viaInfo) {
                this._addViaAtPosition(
                  viasByPosition,
                  viaInfo.position,
                  viaInfo.diameter,
                  connectionName,
                  usedViaRegions,
                  regionId,
                )
              }
            }
          }
        } else {
          // We've exited a via region - place exit via (going back to top layer)
          if (currentViaRegion && viaEntryPort) {
            const exitPort = candidate.lastPort as JPort | null
            if (exitPort) {
              const viaInfo = this._findClosestVia(exitPort, viaLookup)
              if (viaInfo) {
                this._addViaAtPosition(
                  viasByPosition,
                  viaInfo.position,
                  viaInfo.diameter,
                  connectionName,
                  usedViaRegions,
                  currentViaRegion.regionId,
                )
              }
            }
            currentViaRegion = null
            viaEntryPort = null
          }
        }
      }

      // Handle case where route ends inside a via region
      if (currentViaRegion && viaEntryPort) {
        const lastCandidate = solvedRoute.path[solvedRoute.path.length - 1]
        if (lastCandidate) {
          const exitPort = lastCandidate.port as JPort
          const viaInfo = this._findClosestVia(exitPort, viaLookup)
          if (viaInfo) {
            this._addViaAtPosition(
              viasByPosition,
              viaInfo.position,
              viaInfo.diameter,
              connectionName,
              usedViaRegions,
              currentViaRegion.regionId,
            )
          }
        }
      }

      this.solvedRoutes.push({
        connectionName,
        rootConnectionName,
        traceThickness: this.traceWidth,
        route: routePoints,
        viaRegions: usedViaRegions,
      })
    }

    // Build the final via list from viasByPosition
    let viaIndex = 0
    this.vias = Array.from(viasByPosition.values()).map((viaInfo) => ({
      viaRegionId: `via_${viaIndex++}`,
      center: viaInfo.center,
      diameter: viaInfo.diameter,
      connectedTo: Array.from(viaInfo.connectedTo),
    }))
  }

  /**
   * Helper to add a via at a specific position, deduplicating by position
   */
  private _addViaAtPosition(
    viasByPosition: Map<
      string,
      {
        center: { x: number; y: number }
        diameter: number
        connectedTo: Set<string>
      }
    >,
    position: { x: number; y: number },
    diameter: number,
    connectionName: string,
    usedViaRegions: ViaRegion[],
    regionId: string,
  ) {
    const posKey = `${position.x.toFixed(4)},${position.y.toFixed(4)}`

    if (!viasByPosition.has(posKey)) {
      viasByPosition.set(posKey, {
        center: { x: position.x, y: position.y },
        diameter,
        connectedTo: new Set(),
      })
    }
    viasByPosition.get(posKey)!.connectedTo.add(connectionName)

    // Also add to the route's used via regions
    if (
      !usedViaRegions.some(
        (v) =>
          Math.abs(v.center.x - position.x) < 0.01 &&
          Math.abs(v.center.y - position.y) < 0.01,
      )
    ) {
      usedViaRegions.push({
        viaRegionId: regionId,
        center: { x: position.x, y: position.y },
        diameter,
        connectedTo: [connectionName],
      })
    }
  }

  getOutput(): HighDensityIntraNodeRouteWithVias[] {
    return this.solvedRoutes
  }

  /**
   * Returns only the used via regions after solving.
   * Unused vias are filtered out (following the jumper removal pattern).
   */
  getOutputVias(): ViaRegion[] {
    return this.vias
  }

  visualize(): GraphicsObject {
    if (this.viaGraphSolver && !this.solved) {
      return this.viaGraphSolver.visualize()
    }

    const graphics: GraphicsObject = {
      lines: [],
      points: [],
      rects: [],
      circles: [],
    }

    const node = this.nodeWithPortPoints
    const bounds = {
      minX: node.center.x - node.width / 2,
      maxX: node.center.x + node.width / 2,
      minY: node.center.y - node.height / 2,
      maxY: node.center.y + node.height / 2,
    }

    // Draw node boundary
    graphics.lines!.push({
      points: [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.minY },
      ],
      strokeColor: "rgba(255, 0, 0, 0.25)",
      strokeDash: "4 4",
      layer: "border",
    })

    // Draw all routing regions as polygons (via regions + outer frame regions)
    for (const routingRegion of this.allRoutingRegions) {
      const region = routingRegion.region
      const regionId = routingRegion.regionId

      // For via regions, only draw if they were actually used
      // For outer frame regions, always draw them (they form the routing boundary)
      const isUsed = this.viaRegionUsage.has(regionId)
      if (routingRegion.isViaRegion && !isUsed) continue

      // Determine color based on connected nets (for via regions) or use gray for outer frame
      let color = "gray"
      if (routingRegion.isViaRegion && isUsed) {
        const connectedNets = Array.from(
          this.viaRegionUsage.get(regionId) ?? [],
        )
        if (connectedNets.length > 0) {
          color = this.colorMap[connectedNets[0]] ?? "gray"
        }
      }

      // Use different styling for via regions vs outer frame regions
      const strokeOpacity = routingRegion.isViaRegion ? 0.4 : 0.2
      const strokeWidth = routingRegion.isViaRegion ? 0.1 : 0.05

      // Use polygon if available, otherwise fall back to bounds rectangle
      if (region.d.polygon && region.d.polygon.length > 0) {
        // Draw as closed polygon outline
        const polygonPoints = [...region.d.polygon, region.d.polygon[0]]
        graphics.lines!.push({
          points: polygonPoints,
          strokeColor: routingRegion.isViaRegion
            ? safeTransparentize(color, strokeOpacity)
            : "rgba(128, 128, 128, 0.3)",
          strokeWidth,
          strokeDash: "2 2",
          layer: routingRegion.isViaRegion ? "via-region" : "outer-frame",
        })
      } else {
        // Fall back to bounds rectangle outline
        const regionBounds = region.d.bounds
        graphics.lines!.push({
          points: [
            { x: regionBounds.minX, y: regionBounds.minY },
            { x: regionBounds.maxX, y: regionBounds.minY },
            { x: regionBounds.maxX, y: regionBounds.maxY },
            { x: regionBounds.minX, y: regionBounds.maxY },
            { x: regionBounds.minX, y: regionBounds.minY },
          ],
          strokeColor: routingRegion.isViaRegion
            ? safeTransparentize(color, strokeOpacity)
            : "rgba(128, 128, 128, 0.3)",
          strokeWidth,
          strokeDash: "2 2",
          layer: routingRegion.isViaRegion ? "via-region" : "outer-frame",
        })
      }
    }

    // Draw port points
    for (const pp of node.portPoints) {
      graphics.points!.push({
        x: pp.x,
        y: pp.y,
        label: pp.connectionName,
        color: this.colorMap[pp.connectionName] ?? "blue",
      })
    }

    // Draw actual vias (small circles at the via positions)
    for (const via of this.vias) {
      const connectedNames = via.connectedTo.join(", ")
      const color =
        via.connectedTo.length > 0
          ? (this.colorMap[via.connectedTo[0]] ?? "gray")
          : "gray"

      graphics.circles!.push({
        center: via.center,
        radius: via.diameter / 2,
        fill: safeTransparentize(color, 0.3),
        stroke: "rgba(0, 0, 0, 0.7)",
        label: `Via: ${connectedNames}`,
        layer: "via",
      })
    }

    // Draw solved routes
    for (const route of this.solvedRoutes) {
      const color = this.colorMap[route.connectionName] ?? "blue"

      for (let i = 0; i < route.route.length - 1; i++) {
        const p1 = route.route[i]
        const p2 = route.route[i + 1]

        graphics.lines!.push({
          points: [p1, p2],
          strokeColor: safeTransparentize(color, 0.2),
          strokeWidth: route.traceThickness,
          layer: `route-layer-${p1.z}`,
        })
      }
    }

    return graphics
  }
}
