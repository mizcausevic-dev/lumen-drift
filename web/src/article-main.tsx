import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import ArticlePage from "./ArticlePage"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ArticlePage />
  </StrictMode>,
)
