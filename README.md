# Hangar (frontend demo)

Operations console for an IT-hardware rollout: service requests, lease returns, staging,
shipping, technician tours, stock and inventory. Portfolio demo with fictional data.
The operator is Acme IT Services and the client is Globex Fleet AG.

> Work in progress. The full README (screenshots, feature tour, architecture) comes later.

## Quick start

Requires Node 22.12+ and pnpm 10.

```sh
pnpm install
pnpm dev:demo     # http://localhost:5173, runs fully in the browser (mock API)
pnpm dev          # against hangar-backend-demo at http://localhost:8100/api/v1
```

Demo mode stores its data in your browser. Use _Reset demo data_ to start over.

## Stack

React 19, Vite, TypeScript, TanStack Router, Query, Table and Virtual, Radix UI, cmdk,
Tailwind CSS v4, vite-plugin-pwa and MSW. See [CONVENTIONS.md](./CONVENTIONS.md).

## License

[MIT](./LICENSE)
