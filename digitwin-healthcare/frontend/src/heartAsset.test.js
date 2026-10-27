import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { getHeartScenarioOutput, HEART_MODEL_URL, probeHeartAsset } from "./heartAsset.js";

const heartPanel = readFileSync(new URL("./components/Heart3DPanel.jsx", import.meta.url), "utf8");
const heartGlb = readFileSync(new URL("../public/models/heart.glb", import.meta.url));

test("accepts an available local 3D heart model asset", async () => {
  let requestedUrl;
  await probeHeartAsset(async (url, options) => {
    requestedUrl = url;
    assert.equal(options, undefined);
    return new Response(heartGlb, {
      status: 200,
      headers: { "Content-Type": "model/gltf-binary" },
    });
  });
  assert.equal(requestedUrl, HEART_MODEL_URL);
});

test("reports a missing model asset without substituting a geometric fake", async () => {
  await assert.rejects(
    probeHeartAsset(async () => new Response("not found", { status: 404 })),
    /No licensed 3D heart model is installed/
  );
});

test("rejects SPA fallback HTML served for a missing model path", async () => {
  await assert.rejects(
    probeHeartAsset(async () => new Response(null, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    })),
    /HTML fallback instead of a heart model/
  );
});

test("rejects non-GLB model data even when the server returns HTTP 200", async () => {
  await assert.rejects(
    probeHeartAsset(async () => new Response("not a model", {
      status: 200,
      headers: { "Content-Type": "application/octet-stream" },
    })),
    /not a valid GLB file/
  );
});

test("installed heart GLB parses into the actual anatomical mesh", async () => {
  assert.equal(heartGlb.toString("ascii", 0, 4), "glTF");
  assert.equal(heartGlb.readUInt32LE(4), 2);
  assert.equal(heartGlb.readUInt32LE(8), heartGlb.length);
  const bytes = heartGlb.buffer.slice(
    heartGlb.byteOffset,
    heartGlb.byteOffset + heartGlb.byteLength
  );
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(bytes, "", resolve, reject);
  });
  const meshes = [];
  gltf.scene.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  assert.equal(meshes.length, 1);
  assert.equal(meshes[0].geometry.index.count / 3, 22562);
  assert.ok(meshes[0].material.color.r > meshes[0].material.color.g);
  assert.ok(meshes[0].material.color.r > meshes[0].material.color.b);
});

test("surfaces local asset check failures", async () => {
  await assert.rejects(
    probeHeartAsset(async () => { throw new TypeError("offline"); }),
    /Could not check for the local heart model asset/
  );
});

test("selects baseline and treatment values from the simulation result", () => {
  const baseline = { sbp: 120, dbp: 80, hr: 70 };
  const series = [{ t_h: 0, sbp: 118, dbp: 78, hr: 72 }, { t_h: 1, sbp: 115, dbp: 75, hr: 74 }];
  const result = { baseline, series };
  assert.equal(getHeartScenarioOutput(result, "baseline", 1), baseline);
  assert.equal(getHeartScenarioOutput(result, "treatment", 0), series[0]);
  assert.equal(getHeartScenarioOutput(result, "treatment", 50), series[1]);
});

test("returns no scenario output when backend simulation fields are missing", () => {
  assert.equal(getHeartScenarioOutput({}, "baseline", 0), null);
  assert.equal(getHeartScenarioOutput({ series: null }, "treatment", 0), null);
});

test("attributes the verified CC BY model source while retaining honest fallback", () => {
  assert.ok(heartPanel.includes("Place the attributed GLB model"));
  assert.ok(heartPanel.includes("commons.wikimedia.org/wiki/File:3D_model_of_a_human_heart.stl"));
  assert.ok(heartPanel.includes("neshallads"));
  assert.ok(heartPanel.includes("CC BY 4.0"));
  assert.ok(heartPanel.includes("Systolic (SBP)"));
  assert.ok(heartPanel.includes("Diastolic (DBP)"));
  assert.ok(heartPanel.includes("Heart rate (HR)"));
});
