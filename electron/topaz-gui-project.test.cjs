const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createTopazGuiProject} = require('./topaz-gui-project.cjs');

test('Topaz GUI projects contain one source, Proteus and saved 2x/4x geometry without historical jobs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-topaz-project-'));
  try {
    const input = path.join(root, 'source.mp4'); fs.writeFileSync(input, 'fixture');
    for (const factor of [2, 4]) {
      const generated = createTopazGuiProject({directory: path.join(root, 'job-' + factor), input, info: {width: 720, height: 1280, duration: 30, avg_frame_rate: '30000/1001'}, factor});
      const project = JSON.parse(fs.readFileSync(generated.projectFile));
      assert.deepEqual(Object.keys(project.mainManagerState.videos), ['5']);
      assert.deepEqual(Object.keys(project.tabState.tabData), ['162']);
      assert.deepEqual(project.mainManagerState.processQ, {queue: [], processing: []});
      const source = project.mainManagerState.videos[5], filter = project.tabState.tabData[162].filterState;
      assert.equal(filter.EnhancementFilter.model, 'prob-4');
      assert.equal(filter.VideoSettingsFilter.width, String(720 * factor));
      assert.equal(filter.VideoSettingsFilter.height, String(1280 * factor));
      assert.equal(filter.VideoSettingsFilter.outSizeMethod, factor === 4 ? 2 : 1);
      assert.equal(source.video.videoInfo.duration, 30000);
      assert.equal(source.video.videoInfo.video[0].numFrames, Math.round(30 * 30000 / 1001));
      assert(Number.isInteger(source.video.trimRange.y));
      assert(Math.abs(source.video.fps - 30000 / 1001) < 0.000001);
      assert.deepEqual(source.exports, []);
      assert.equal(source.videoPath, input.replaceAll('\\', '/'));
      assert.equal(generated.expectedOutput, path.join(root, 'source_prob4.mp4'));
      assert(!JSON.stringify(project).includes('topaz-gui-input'));
      assert.throws(() => createTopazGuiProject({directory: path.join(root, 'job-' + factor), input, info: {width: 720, height: 1280, duration: 30}, factor}), /已有工程/);
    }
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('Topaz GUI project builder rejects unsupported scales and missing video metadata before creating an output', () => {
  assert.throws(() => createTopazGuiProject({factor: 3}), /倍率/);
  assert.throws(() => createTopazGuiProject({directory: 'relative', input: 'relative', factor: 2}), /绝对路径/);
});

test('Topaz GUI projects retain AAC tracks and timing instead of treating an audible video as silent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-topaz-audio-'));
  try {
    const input = path.join(root, 'source.mp4'); fs.writeFileSync(input, 'fixture');
    const generated = createTopazGuiProject({directory: path.join(root, 'job'), input, info: {width: 256, height: 256, duration: 1, fps: 24, audioStreams: [{index: 1, id: '0x2', codec_name: 'aac', profile: 'LC', sample_rate: '48000', channels: 2, time_base: '1/48000', duration_ts: 48000, nb_frames: '48', bit_rate: '128000', start_pts: 0, tags: {language: 'und'}}]}});
    const project = JSON.parse(fs.readFileSync(generated.projectFile)), source = project.mainManagerState.videos[5];
    const track = source.videoInfo.audio[0];
    assert.equal(track.codecName, 'aac'); assert.equal(track.codecId, 86018);
    assert.equal(track.id, 2); assert.equal(track.sampleRate, 48000); assert.equal(track.channels, 2);
    assert.equal(track.duration, 48000); assert.equal(track.timebase, 1 / 48000); assert.equal(track.numFrames, 48);
    assert.equal(track.metadata.language, 'und');
    assert.deepEqual(source.video.videoInfo.audio, source.videoInfo.audio);
    assert.equal(project.tabState.tabData[162].filterState.ExportFilter.audioMode, 1);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
