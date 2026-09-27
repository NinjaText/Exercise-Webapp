import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: 15,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: "contain",
  },
  organizationInfo: {
    flexDirection: "column",
  },
  organizationName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
  },
  tagline: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 2,
  },
  pageNumber: {
    fontSize: 9,
    color: "#9CA3AF",
  },
});

interface PdfHeaderProps {
  organizationName?: string;
  tagline?: string;
  logoBuffer?: Buffer | null;
  /** Text-safe brand hex for the organization name; omitted → product colour. */
  accentHex?: string | null;
  pageNumber: number;
}

export function PdfHeader({
  organizationName,
  tagline,
  logoBuffer,
  accentHex,
  pageNumber,
}: PdfHeaderProps) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.leftSection}>
        {logoBuffer && (
          <Image
            style={styles.logo}
            src={{ data: logoBuffer, format: "png" }}
          />
        )}
        <View style={styles.organizationInfo}>
          {organizationName && (
            <Text
              style={
                accentHex
                  ? [styles.organizationName, { color: accentHex }]
                  : styles.organizationName
              }
            >
              {organizationName}
            </Text>
          )}
          {tagline && <Text style={styles.tagline}>{tagline}</Text>}
        </View>
      </View>
      <Text style={styles.pageNumber}>Page {pageNumber}</Text>
    </View>
  );
}
