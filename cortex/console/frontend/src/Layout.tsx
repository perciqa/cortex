import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Dashboard from "@mui/icons-material/Dashboard";
import Article from "@mui/icons-material/Article";
import SmartToy from "@mui/icons-material/SmartToy";
import Hub from "@mui/icons-material/Hub";
import FilterAlt from "@mui/icons-material/FilterAlt";
import Speed from "@mui/icons-material/Speed";
import Shield from "@mui/icons-material/Shield";
import { StatusPill } from "./components/StatusPill";

export type ViewId = "overview" | "feed" | "detail" | "provenance" | "scope" | "bench" | "attack" | "activity";

export interface LayoutProps {
  current: ViewId;
  onNavigate: (v: ViewId) => void;
  connected: boolean;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Fabric Overview", icon: <Dashboard /> },
  { id: "feed", label: "Article Feed", icon: <Article /> },
  { id: "activity", label: "Agent Activity", icon: <SmartToy /> },
  { id: "provenance", label: "Provenance Graph", icon: <Hub /> },
  { id: "scope", label: "Scope Filter", icon: <FilterAlt /> },
  { id: "bench", label: "Bench Panel", icon: <Speed /> },
  { id: "attack", label: "Attack Matrix", icon: <Shield /> },
];

const DRAWER_WIDTH = 240;

export function Layout({ current, onNavigate, connected, children }: LayoutProps) {
  return (
    <Box className="app-container" sx={{ display: "flex" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            position: "relative",
          },
        }}
      >
        <AppBar position="static" elevation={0}>
          <Toolbar>
            <Typography
              variant="h6"
              sx={{
                flexGrow: 1,
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              Perciqa Cortex
            </Typography>
            <StatusPill connected={connected} />
          </Toolbar>
        </AppBar>
        <List>
          {NAV_ITEMS.map((item) => (
            <ListItemButton
              key={item.id}
              selected={current === item.id}
              onClick={() => onNavigate(item.id)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, minHeight: "100vh" }}>
        {children}
      </Box>
    </Box>
  );
}
