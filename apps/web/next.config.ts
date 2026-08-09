import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next.js genera AGENTS.md y CLAUDE.md dentro de apps/web al arrancar. Las instrucciones de
  // los agentes de este repositorio viven en docs/, no duplicadas por una herramienta.
  agentRules: false,
  // postgres.js abre sockets TCP/TLS de Node: se deja fuera del bundle del servidor.
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
