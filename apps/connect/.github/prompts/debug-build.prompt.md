---
description: "Diagnose and fix build failures, type errors, and lint issues in Citizens Connect"
agent: "agent"
argument-hint: "Describe the error or paste the build output"
---
Debug and fix build/type/lint errors in Citizens Connect.

## Environment Context

**Critical Windows setup:**
```powershell
# Node.js PATH doesn't persist between terminal sessions
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
```

**Build command (use local Next.js 15, NOT global Next.js 16):**
```powershell
Push-Location C:\Users\SJ\Desktop\Businesses\citizens-connect
& ".\node_modules\.bin\next.cmd" build 2>&1
```

**Type check only:**
```powershell
npx tsc --noEmit
```

## Common Issues & Fixes

### "Map container is already initialized"
- Cause: missing `map.remove()` cleanup in useEffect return
- Fix: Use MapLibre GL JS pattern with `useEffect`/`useRef` and `map.remove()` in cleanup

### Next.js 15 params error
- Cause: `params` is now `Promise<{ id: string }>` in Next.js 15
- Fix: `const { id } = await params` instead of destructuring directly

### `<img>` lint warning
- For Supabase URLs: Use `next/image` `<Image>` component
- For blob preview URLs: Use `<img>` with `{/* eslint-disable-next-line @next/next/no-img-element */}`

### setState during render / useEffect
- Never call setState synchronously in useEffect without a condition
- Use inline fetch with `cancelled` flag pattern for data loading

### Supabase storage images not loading
- Verify domain is in `next.config.ts` `images.remotePatterns`
- Check bucket is public and path convention matches

### PowerShell template literal escaping
- Backticks in terminal commands conflict with PowerShell escape character
- Use `create_file` tool instead of terminal for files containing template literals

## Debug Workflow

1. Run build command above and capture output
2. Parse error messages — identify file, line, and error type
3. Read the affected file(s) for context
4. Apply fix
5. Re-run build to verify
6. If errors persist, check `tsconfig.json` and `next.config.ts` for configuration issues
