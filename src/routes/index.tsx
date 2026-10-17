import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <iframe
      title="Screen Free Rewards"
      src="/screen-free.html"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        background: "#090909",
      }}
    />
  );
}
