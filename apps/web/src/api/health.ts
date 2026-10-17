import type { HealthResponse } from '@todo/shared';
import { api } from './client';

export const getHealth = () => api<HealthResponse>('/health');
