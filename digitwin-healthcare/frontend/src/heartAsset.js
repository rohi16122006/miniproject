export const HEART_MODEL_URL = "/models/heart.glb";

export async function probeHeartAsset(fetcher = fetch) {
  let response;
  try {
    response = await fetcher(HEART_MODEL_URL);
  } catch {
    throw new Error("Could not check for the local heart model asset.");
  }
  if (!response.ok) {
    throw new Error(`No licensed 3D heart model is installed at ${HEART_MODEL_URL}.`);
  }
  if (response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
    throw new Error(`The server returned an HTML fallback instead of a heart model at ${HEART_MODEL_URL}.`);
  }
  const header = new Uint8Array(await response.arrayBuffer()).subarray(0, 4);
  if (header.length !== 4 || header[0] !== 0x67 || header[1] !== 0x6c || header[2] !== 0x54 || header[3] !== 0x46) {
    throw new Error(`The response at ${HEART_MODEL_URL} is not a valid GLB file.`);
  }
}

export function getHeartScenarioOutput(result, scenario, sampleIndex) {
  if (scenario === "baseline") return result?.baseline || null;
  const samples = Array.isArray(result?.series) ? result.series : [];
  return samples[sampleIndex] || samples[samples.length - 1] || null;
}
