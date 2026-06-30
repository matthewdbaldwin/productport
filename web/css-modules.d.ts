// CSS Modules ambient typing — Next generates this via next-env.d.ts at build
// time, but raw `tsc --noEmit` (the CI typecheck) runs before that. Declare it
// explicitly so the type of `import s from './x.module.css'` is known.
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
