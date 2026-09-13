// Keep retirement separate from the shared membership and payment services.
export function practiceLogRetired(env) {
  return env.PRACTICE_LOG_RETIRED === 'true';
}

export function retiredLogRequest(env, path) {
  if (!practiceLogRetired(env)) return false;
  // Preserve independent services and authenticated data-erasure/payment access.
  if (path === '/api/health' || path.startsWith('/api/club/') ||
      path === '/api/cal/webhook' || path === '/api/stripe/webhook' ||
      path === '/api/giving' || path === '/api/giving/manage' ||
      path === '/api/settings/delete') return false;
  return path.startsWith('/api/');
}

export function retirementResponse() {
  return new Response(JSON.stringify({
    error: 'retired',
    message: 'The Practice Log has been retired. For questions about your records, contact john@spacetobe.xyz.',
  }), {
    status: 410,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
