import Grid from "@mui/material/Grid2";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Business from "@mui/icons-material/Business";
import Assessment from "@mui/icons-material/Assessment";

const ORG_MAP: Record<string, string> = {
  "did:percq:org:soc-alpha": "soc-alpha",
  "did:percq:org:soc-beta": "soc-beta",
};

export function FabricOverview({ tenants, events }: { tenants: { slug: string }[]; events: any[] }) {
  const articles = events.filter(e => e.data?.article?.id);
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        Fabric Overview
      </Typography>
      <Grid container spacing={2}>
        {tenants.map(t => {
          const count = articles.filter(e => {
            const srcOrg = e.data?.src_org || "";
            const slug = ORG_MAP[srcOrg] || srcOrg;
            return slug === t.slug || (!srcOrg && t.slug === "soc-alpha");
          }).length;
          return (
            <Grid key={t.slug} size={{ xs: 12, sm: 6 }}>
              <Card>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Business sx={{ color: "primary.main", fontSize: 20 }} />
                      <Typography variant="h6">{t.slug}</Typography>
                    </Box>
                    <Chip label={count} color="primary" size="small" />
                  </Box>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {count} article{count !== 1 ? "s" : ""}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ borderColor: "primary.main", borderWidth: 1, borderStyle: "solid" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Assessment sx={{ color: "primary.main", fontSize: 20 }} />
                  <Typography variant="h6">Total</Typography>
                </Box>
                <Chip label={articles.length} color="primary" size="small" />
              </Box>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {articles.length} article{articles.length !== 1 ? "s" : ""}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
