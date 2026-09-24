import { fetchRunnerLeg, trimToJoin, type RunnerLeg } from '../lib/riverRunner'

/**
 * The river and every river below it, down to the terminus. The first lookup's
 * `encompassing_mainstem_basins` already names the whole chain, nearest first,
 * so the rest are fetched in parallel; each is then trimmed to start where the
 * river above joins it.
 */
export async function fetchDownstreamPath(uri: string, signal: AbortSignal): Promise<RunnerLeg[]> {
  const root = await fetchRunnerLeg(uri, signal)
  const below = await Promise.all(root.downstreamChain.map((next) => fetchRunnerLeg(next, signal)))
  const legs = [root]
  for (const leg of below) {
    const above = legs[legs.length - 1]
    legs.push(trimToJoin(leg, above.coords[above.coords.length - 1]))
  }
  return legs
}
