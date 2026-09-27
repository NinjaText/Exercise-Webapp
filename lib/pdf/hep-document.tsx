import { Document, Page, View, StyleSheet } from "@react-pdf/renderer";
import { PdfHeader } from "./components/pdf-header";
import { PdfPlanInfo } from "./components/pdf-plan-info";
import { PdfDayColumn } from "./components/pdf-day-column";
import { PdfFooter } from "./components/pdf-footer";

const styles = StyleSheet.create({
  page: {
    padding: 28,
    paddingBottom: 28,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  dayList: {
    marginTop: 6,
  },
  dayItem: {
    marginBottom: 10,
  },
});

interface PlanExerciseData {
  exerciseId: string;
  name: string;
  sets: number;
  reps?: number | null;
  durationSeconds?: number | null;
  restSeconds?: number | null;
  notes?: string | null;
  cuesThumbnail?: string | null;
  dayOfWeek: number;
  videoUrl?: string | null;
}

interface HEPDocumentProps {
  planTitle: string;
  planDescription?: string | null;
  clientName?: string;
  createdDate: string;
  daysPerWeek?: number | null;
  durationMinutes?: number | null;
  organizationName?: string;
  organizationTagline?: string;
  organizationLogoBuffer?: Buffer | null;
  /** Text-safe brand hex for the organization name; omitted → product colour. */
  accentHex?: string | null;
  exercisesByDay: Map<number, PlanExerciseData[]>;
  imageMap: Map<string, Buffer>;
  placeholderBuffer: Buffer;
}

export function HEPDocument({
  planTitle,
  planDescription,
  clientName,
  createdDate,
  daysPerWeek,
  durationMinutes,
  organizationName,
  organizationTagline,
  organizationLogoBuffer,
  accentHex,
  exercisesByDay,
  imageMap,
  placeholderBuffer,
}: HEPDocumentProps) {
  const days = Array.from(exercisesByDay.entries()).sort(
    ([a], [b]) => a - b
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader
          organizationName={organizationName}
          tagline={organizationTagline}
          logoBuffer={organizationLogoBuffer}
          accentHex={accentHex}
          pageNumber={1}
        />
        <PdfPlanInfo
          title={planTitle}
          clientName={clientName}
          createdDate={createdDate}
          daysPerWeek={daysPerWeek}
          durationMinutes={durationMinutes}
        />
        <View style={styles.dayList}>
          {days.map(([dayNum, exercises]) => (
            <View key={dayNum} style={styles.dayItem} wrap={false}>
              <PdfDayColumn
                dayNumber={dayNum}
                exercises={exercises.map((ex) => ({
                  name: ex.name,
                  sets: ex.sets,
                  reps: ex.reps,
                  durationSeconds: ex.durationSeconds,
                  restSeconds: ex.restSeconds,
                  notes: ex.notes,
                  cuesThumbnail: ex.cuesThumbnail,
                  imageBuffer: imageMap.get(ex.exerciseId) ?? null,
                  videoUrl: ex.videoUrl ?? null,
                }))}
                placeholderBuffer={placeholderBuffer}
              />
            </View>
          ))}
        </View>
        <PdfFooter description={planDescription} />
      </Page>
    </Document>
  );
}
