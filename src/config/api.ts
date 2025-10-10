// Local server configuration
export const API_CONFIG = {
  baseURL: 'http://localhost:3001',
  endpoints: {
    chat: {
      models: '/api/chat/models',
      stream: '/api/chat/stream',
      message: '/api/chat/message',
    },
    navigator: {
      start: '/api/navigator/start',
      pause: '/api/navigator/pause',
      resume: '/api/navigator/resume',
      stop: '/api/navigator/stop',
      logs: '/api/navigator/logs',
      action: '/api/navigator/action',
    },
    jobs: {
      uploadResume: '/api/jobs/upload-resume',
      start: '/api/jobs/start',
      status: '/api/jobs/status',
      stop: '/api/jobs/stop',
    },
    price: {
      search: '/api/price/search',
    },
  },
};

export const getApiUrl = (endpoint: string) => {
  return `${API_CONFIG.baseURL}${endpoint}`;
};
