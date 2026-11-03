const fs = require('node:fs');
const path = require('node:path');
const template = require('./topaz-gui-template.json');

function createTopazGuiProject({directory, input, info, factor = 2, encoder = 'h264-main-win-nvidia'}) {
  const scale = Number(factor);
  if (![2, 4].includes(scale)) throw Error('Topaz 超分倍率应为 2 或 4');
  if (!path.isAbsolute(directory) || !path.isAbsolute(input)) throw Error('Topaz 项目与输入必须使用绝对路径');
  if (!fs.statSync(input).isFile()) throw Error('Topaz 输入不是视频文件');
  const width = Number(info?.width), height = Number(info?.height), duration = Number(info?.duration);
  const fps = frameRate(info?.fps || info?.avg_frame_rate || info?.r_frame_rate || 24);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !Number.isFinite(duration) || duration <= 0) throw Error('Topaz 输入视频参数无效');
  fs.mkdirSync(directory, {recursive: true});
  const projectFile = path.join(directory, 'project.tvai');
  if (fs.existsSync(projectFile)) throw Error('Topaz 工作目录已有工程，请使用新的独立目录');
  const portable = value => value.replaceAll('\\', '/');
  const sourcePath = portable(fs.realpathSync(input));
  const projectDirectory = portable(fs.realpathSync(directory));
  const project = structuredClone(template);
  const title = path.basename(directory);
  Object.assign(project.projectInfo, {
    date: new Date().toISOString(), firstCreated: new Date().toISOString(), projectName: title,
    previewPath: projectDirectory + '/previews', thumbnailPath: projectDirectory + '/thumbnails/',
    tempPath: projectDirectory + '/temp', projectPath: portable(projectFile),
  });
  for (const folder of ['previews', 'thumbnails', 'temp']) fs.mkdirSync(path.join(directory, folder));
  const source = project.mainManagerState.videos[5], video = source.video;
  const milliseconds = duration * 1000, lastFrame = Math.max(0, Math.round(milliseconds - 1000 / fps));
  const numFrames = Number(info.nb_frames) > 0 ? Number(info.nb_frames) : Math.round(duration * fps);
  source.videoPath = video.videoPath = video.originalPath = sourcePath;
  source.ts = Date.now();
  video.duration = milliseconds;
  video.fps = fps;
  video.resolution = {width, height};
  video.previewRange = video.trimRange = {x: 0, y: lastFrame};
  video.roi = {x: 0, y: 0, width, height, left: 0, right: width, top: 0, bottom: height};
  for (const metadata of [source.videoInfo, video.videoInfo]) {
    Object.assign(metadata, {
      path: sourcePath, width, height, duration: milliseconds, fps, framerate: fps,
      length: Math.round(duration * fps) * 512, step: 512, timebase: 1 / (fps * 512),
      timestep: 1000 / fps, thumbnail: '', thumbnailDiskLocation: '',
      video: [{id: 1, codecName: info.codec_name || 'h264', numFrames, duration: numFrames * 512, startTime: 0}],
      adjustedSize: {width, height}, originalSize: {width, height},
      resolution: {width, height}, size: {width, height},
    });
    if (Array.isArray(info.audioStreams)) metadata.audio = info.audioStreams.map(audioMetadata);
    else if (Array.isArray(info.audio)) metadata.audio = structuredClone(info.audio);
  }
  const filters = [video.leftFilterState, video.rightFilterState, project.tabState.tabData[162].filterState];
  for (const filter of filters) {
    filter.EnhancementFilter.model = 'prob-4';
    filter.EnhancementFilter.active = filter !== video.rightFilterState;
    Object.assign(filter.VideoSettingsFilter, {
      width: String(width * scale), height: String(height * scale), scale: String(scale * 100),
      inputFps: fps, outputFps: fps.toFixed(3), outSizeMethod: scale === 4 ? 2 : 1,
    });
    filter.ExportFilter.encoderId = encoder;
    filter.ExportFilter.audioMode = info.hasAudio === false ? 0 : 1;
  }
  project.tabState.tabData[162].name = `Proteus ${scale}x`;
  fs.writeFileSync(projectFile, JSON.stringify(project, null, 2), {flag: 'wx'});
  const expectedOutput = path.join(path.dirname(input), path.parse(input).name + '_prob4.mp4');
  return {projectFile, title, expectedOutput, width: width * scale, height: height * scale, model: 'prob-4', factor: scale};
}

function frameRate(value) {
  const parts = String(value).split('/').map(Number);
  const rate = parts.length === 2 ? parts[0] / parts[1] : parts[0];
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) throw Error('Topaz 输入帧率无效');
  return rate;
}

function audioMetadata(stream, index) {
  const codecIds = {aac: 86018, mp3: 86017, ac3: 86019, eac3: 86056, opus: 86076, vorbis: 86021, flac: 86028, pcm_s16le: 65536, pcm_s24le: 65548, pcm_s32le: 65544, pcm_f32le: 65557};
  const sampleRate = Number(stream.sample_rate) || 48000;
  const timebase = String(stream.time_base || '1/' + sampleRate).split('/').map(Number);
  const secondsPerTick = timebase.length === 2 ? timebase[0] / timebase[1] : 1 / sampleRate;
  const durationTicks = Number(stream.duration_ts);
  const id = Number(stream.id);
  const fallbackId = Number.isInteger(Number(stream.index)) ? Number(stream.index) + 1 : index + 2;
  return {
    bitrate: Number(stream.bit_rate) || 0,
    channels: Number(stream.channels) || 2,
    codecId: codecIds[stream.codec_name] || 0,
    codecName: stream.codec_name || '',
    duration: Number.isFinite(durationTicks) ? durationTicks : Math.round((Number(stream.duration) || 0) / secondsPerTick),
    id: Number.isInteger(id) && id > 0 ? id : fallbackId,
    metadata: structuredClone(stream.tags || {}),
    numFrames: Number(stream.nb_frames) || 0,
    profile: stream.codec_name === 'aac' ? ({Main: 0, LC: 1, 'HE-AAC': 4, 'HE-AACv2': 28}[stream.profile] ?? 1) : -99,
    sampleRate,
    timebase: secondsPerTick,
    startTime: Number(stream.start_pts) || 0,
  };
}

module.exports = {createTopazGuiProject};
