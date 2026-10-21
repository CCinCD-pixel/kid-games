import { getStore } from '@netlify/blobs';
import { consumeQuota, createHandler } from '../lib/soe-core.mjs';

export default async (request) => createHandler({
  env: process.env,
  quota: day => consumeQuota(getStore({ name: 'pinyin-soe-quota', consistency: 'strong' }), day),
})(request);
