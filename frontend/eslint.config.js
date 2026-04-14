import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist"] },
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Project convention: useEffect must always have empty deps [].
      // Reactive side-effects go through store actions or event subscriptions.
      "react-hooks/exhaustive-deps": "off",
    },
  },
];
