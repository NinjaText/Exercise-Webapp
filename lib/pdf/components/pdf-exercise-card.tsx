import { View, Text, Image, Link, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    paddingVertical: 7,
    borderBottomWidth: 0.6,
    borderBottomColor: "#E5E7EB",
    alignItems: "flex-start",
  },
  thumbnail: {
    width: 42,
    height: 42,
    objectFit: "cover",
    borderRadius: 4,
    marginRight: 8,
  },
  content: {
    flex: 1,
    flexDirection: "column",
  },
  name: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#111827",
    lineHeight: 1.25,
    marginBottom: 2,
  },
  nameLink: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#8B5A36",
    lineHeight: 1.25,
    marginBottom: 2,
    textDecoration: "underline",
  },
  prescription: {
    fontSize: 8.5,
    color: "#374151",
    marginBottom: 2,
  },
  cues: {
    fontSize: 8,
    color: "#6B7280",
    lineHeight: 1.25,
  },
});

interface PdfExerciseCardProps {
  name: string;
  sets: number;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
  cuesThumbnail?: string | null;
  imageBuffer?: Buffer | null;
  placeholderBuffer: Buffer;
  videoUrl?: string | null;
}

export function PdfExerciseCard({
  name,
  sets,
  reps,
  durationSeconds,
  notes,
  cuesThumbnail,
  imageBuffer,
  placeholderBuffer,
  videoUrl,
}: PdfExerciseCardProps) {
  const prescription = reps
    ? `${sets} sets x ${reps} reps`
    : durationSeconds
      ? `${sets} sets x ${durationSeconds}s hold`
      : `${sets} sets`;

  const displayCues = notes || cuesThumbnail;
  const safeCues = displayCues ? displayCues.slice(0, 180) : null;

  const imgSrc = imageBuffer
    ? { data: imageBuffer, format: "png" as const }
    : { data: placeholderBuffer, format: "png" as const };

  return (
    <View style={styles.card}>
      <Image style={styles.thumbnail} src={imgSrc} />
      <View style={styles.content}>
        {videoUrl ? (
          <Text style={styles.nameLink}>
            <Link src={videoUrl}>{name}</Link>
          </Text>
        ) : (
          <Text style={styles.name}>{name}</Text>
        )}
        <Text style={styles.prescription}>{prescription}</Text>
        {safeCues && (
          <Text style={styles.cues}>{safeCues}</Text>
        )}
      </View>
    </View>
  );
}
