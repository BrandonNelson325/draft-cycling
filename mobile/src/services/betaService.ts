import apiClient from '../api/client';

export const betaService = {
  async activateBetaAccess(code: string) {
    const { data } = await apiClient.post('/api/beta/activate', { code });
    return data;
  },

  async checkBetaAccess() {
    const { data } = await apiClient.get('/api/beta/check');
    return data;
  },
};
