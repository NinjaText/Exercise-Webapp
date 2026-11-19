import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PdfExerciseCard } from "./pdf-exercise-card";

const styles = StyleSheet.create({
  column: {
    padding: 8,
    borderWidth: 0.8,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  dayHeader: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 7,
    paddingBottom: 5,
    borderBottomWidth: 0.8,
    borderBottomColor: "#8B5A36",
  },
  emptyText: {
    fontSize: 8,
    color: "#6B7280",
    fontStyle: "italic",
  },
});

const DAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

interface ExerciseData {
  name: string;
  sets: number;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
  cuesThumbnail?: string | null;
  imageBuffer?: Buffer | null;
  videoUrl?: string | null;
}

interface PdfDayColumnProps {
  dayNumber: number;
  exercises: ExerciseData[];
  placeholderBuffer: Buffer;
}

export function PdfDayColumn({
  dayNumber,
  exercises,
  placeholderBuffer,
}: PdfDayColumnProps) {
  const dayName = DAY_NAMES[dayNumber] || `Day ${dayNumber}`;

  return (
    <View style={styles.column}>
      <Text style={styles.dayHeader}>
        DAY {dayNumber} -- {dayName.toUpperCase()}
      </Text>
      {exercises.length === 0 ? (
        <Text style={styles.emptyText}>No exercises assigned for this day.</Text>
      ) : (
        exercises.map((exercise, idx) => (
          <PdfExerciseCard
            key={idx}
            {...exercise}
            placeholderBuffer={placeholderBuffer}
          />
        ))
      )}
    </View>
  );
}
