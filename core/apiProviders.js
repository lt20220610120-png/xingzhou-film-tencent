// ============================================================
// apiProviders.js — API提供商配置
// ============================================================

export const API_PROVIDERS = {
  hermesCompatible: {
    name: 'Hermes兼容',
    type: 'hermesCompatible',
    defaultEndpoint: 'http://localhost:11434/v1',
    defaultModel: '',
    description: '兼容 OpenAI API 格式的本地/自部署服务（如 Ollama、LM Studio 等）',
    requiresApiKey: false,
    keyName: 'apiKey',
  },
  openai: {
    name: 'OpenAI',
    type: 'openai',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    description: 'OpenAI 官方 API（GPT-4o, GPT-4, GPT-3.5 等）',
    requiresApiKey: true,
    keyName: 'apiKey',
  },
  deepseek: {
    name: 'DeepSeek',
    type: 'deepseek',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    description: 'DeepSeek 官方 API（DeepSeek-V3, DeepSeek-R1 等）',
    requiresApiKey: true,
    keyName: 'apiKey',
  },
  openrouter: {
    name: 'OpenRouter',
    type: 'openrouter',
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    description: 'OpenRouter 统一 API 网关，可访问多种模型',
    requiresApiKey: true,
    keyName: 'apiKey',
  },
  claudeCodePool: {
    name: 'Claude Code Pool',
    type: 'claudeCodePool',
    defaultEndpoint: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    description: 'Anthropic Claude 官方 API（Claude Opus, Sonnet, Haiku 等）',
    requiresApiKey: true,
    keyName: 'apiKey',
  },
  custom: {
    name: '自定义',
    type: 'custom',
    defaultEndpoint: '',
    defaultModel: '',
    description: '自定义 OpenAI 兼容 API 端点',
    requiresApiKey: false,
    keyName: 'apiKey',
  },
};
