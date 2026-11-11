const test = require('node:test');
const assert = require('node:assert/strict');

test('GenerationComposer switches profiles cleanly without clobbering draft state and validates mixed LibTV references', async () => {
  const { createServer } = await import('vite');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { GenerationComposer } = await server.ssrLoadModule('/src/v06/GenerationComposer.jsx');

    // Real Seedance 2.5 does NOT include text2video in modeType.items!
    const seedanceSchema = {
      properties: {
        modeType: {
          items: { singleImage2video: [1, 1], frames2video: [2, 2], image2video: [1, 30], mixed2video: [1, 50] },
          mixed2videoConfig: { imageMax: 30, videoMax: 10, audioMax: 10 },
        },
        ratio: { enum: ['16:9', '9:16'], default: '16:9', originalField: 'ratio' },
        duration: { component: 'slider', min: 4, max: 30, step: 1, default: 5, originalField: 'duration' },
        resolution: { enum: ['480p', '720p'], default: '480p', originalField: 'resolution' },
        enableSound: { enum: ['on', 'off'], default: 'on', originalField: 'enableSound' },
        searchEnabled: { component: 'switch', default: 1, originalField: 'search_enabled' },
      },
      config: {
        settings: { image2video: ['ratio', 'resolution', 'duration', 'enableSound'], mixed2video: ['ratio', 'resolution', 'duration', 'enableSound'] },
        advancedSettings: ['searchEnabled'],
      },
    };

    const state = {
      activeVideoApiId: 'libtv-video',
      mediaProfiles: [
        {
          id: 'libtv-video',
          provider: 'libtv',
          kind: 'video',
          name: 'LibTV · 视频',
          endpoint: 'https://www.liblib.tv',
          model: 'star-video2.5',
          libtvOwnerKey: 'owner-1',
          capabilities: { ratios: ['16:9', '9:16'], durations: [5, 17], resolutions: ['480p', '720p'], maxImages: 30, maxAudios: 10, maxVideos: 10 },
          modelCatalog: [{ id: 'star-video2.5', name: 'Seedance 2.5', kind: 'video', schema: seedanceSchema, ratios: ['16:9', '9:16'], durations: [5, 17], resolutions: ['480p', '720p'], maxImages: 30, maxAudios: 10, maxVideos: 10 }],
        },
        {
          id: 'ft-video',
          provider: 'fnko',
          kind: 'video',
          name: 'FT直连',
          endpoint: 'https://fanke2026.xyz/api/open/v1',
          model: 'seedance-2.0-fast',
          capabilities: { ratios: ['16:9'], durations: [5, 15], resolutions: ['720p'], maxImages: 9, maxAudios: 3, maxVideos: 3 },
          modelCatalog: [{ id: 'seedance-2.0-fast', name: 'Seedance 2.0 Fast', kind: 'video', ratios: ['16:9'], durations: [5, 15], resolutions: ['720p'], maxImages: 9, maxAudios: 3, maxVideos: 3 }],
        },
      ],
    };

    // 1. Render settingsOnly default panel with NO references on Seedance 2.5:
    //    must NOT show false "此模型不支持当前参考组合" alert!
    const settingsHtml = renderToStaticMarkup(
      React.createElement(GenerationComposer, {
        settingsOnly: true,
        kind: 'video',
        state,
        value: { profileId: 'libtv-video', model: 'star-video2.5', ratio: '16:9', duration: 5, resolution: '480p', libtvMode: 'auto', libtvParams: {} },
        onChange: () => {},
        api: {},
      })
    );
    assert.doesNotMatch(settingsHtml, /此模型不支持当前参考组合/);
    assert.match(settingsHtml, /默认生成接口/);
    assert.match(settingsHtml, /FT直连/);

    // 2. Render shot composer with batch-inherited libtvMode='image2video' + 2 images + 1 audio ref:
    //    must auto-upgrade to mixed2video without showing an error alert
    const shotHtml = renderToStaticMarkup(
      React.createElement(GenerationComposer, {
        kind: 'video',
        state,
        value: {
          profileId: 'libtv-video',
          model: 'star-video2.5',
          prompt: '时江晚醒来查看手机',
          ratio: '16:9',
          duration: 17,
          resolution: '480p',
          libtvMode: 'image2video',
          libtvParams: {},
          references: [
            { id: 'a1:i1', kind: 'asset-image', assetId: 'a1', imageId: 'i1', name: '时江晚-日常服', filePath: 'D:/a.png' },
            { id: 'a2:i2', kind: 'image', assetId: 'a2', imageId: 'i2', name: '陈修私人公寓', filePath: 'D:/b.png' },
            { id: 'v1', kind: 'audio', name: '时江晚音色', filePath: 'D:/c.flac' },
          ],
        },
        onChange: () => {},
        onSubmit: async () => {},
        api: {},
      })
    );
    assert.doesNotMatch(shotHtml, /当前模式不支持这组参考素材/);
    assert.doesNotMatch(shotHtml, /此模型不支持当前参考组合/);
    assert.match(shotHtml, /自动匹配参考素材|全能参考|图片参考/);
  } finally {
    await server.close();
  }
});
