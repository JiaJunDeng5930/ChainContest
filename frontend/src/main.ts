import "./styles/index.css";

function bootstrap(): void {
  const root = document.querySelector<HTMLElement>("#app-root");

  if (!root) {
    throw new Error("Missing #app-root container. Verify base template setup.");
  }

  root.dataset.status = "initializing";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
