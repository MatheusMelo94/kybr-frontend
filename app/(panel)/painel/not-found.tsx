import type { JSX } from "react";

// A notFound() render doesn't carry the layout's stylesheet: import it here.
import "./panel.css";

// Placeholder: the final S16 page lands in T60.
export default function PanelNotFound(): JSX.Element {
  return (
    <main>
      <h1>Página não encontrada</h1>
    </main>
  );
}
