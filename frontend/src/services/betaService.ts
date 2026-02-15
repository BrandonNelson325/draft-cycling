import { api } from './api';

export const betaService = {
  async activateBetaAccess(code: string) {
    const { data, error } = await api.post('/api/beta/activate', { code }, true);

    if (error) {
      throw new Error(error.error || 'Failed to activate beta access');
    }

    return data;
  },

  async checkBetaAccess() {
    const { data, error } = await api.get('/api/beta/check', true);

    if (error) {
      throw new Error(error.error || 'Failed to check beta access');
    }

    return data;
  },
};
