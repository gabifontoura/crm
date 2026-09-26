import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createRouter, RouterProvider } from "@tanstack/react-router"

import { routeTree } from "./routeTree.gen"
import "./styles.css"

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const elemento = document.getElementById("root")!

createRoot(elemento).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
