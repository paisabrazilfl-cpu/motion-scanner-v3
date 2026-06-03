import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installChartErrorGuard } from "./lib/chart-error-guard";

installChartErrorGuard();

createRoot(document.getElementById("root")!).render(<App />);
