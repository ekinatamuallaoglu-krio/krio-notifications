const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["sequelize", "sqlite3", "@whiskeysockets/baileys"],
  productionBrowserSourceMaps: false,
};

export default nextConfig;
