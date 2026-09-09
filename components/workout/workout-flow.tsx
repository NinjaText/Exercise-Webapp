"use client";

import React, { useState } from "react";
import { 
  Play, 
  CheckCircle2, 
  Video, 
  AlertTriangle, 
  ArrowRight, 
  ArrowLeft,
  ThumbsDown,
  ThumbsUp,
  X,
  MessageSquare,
  Activity
} from "lucide-react";

// --- Types ---

export type Exercise = {
  id: string;
  name: string;
  description: string;
  videoUrl?: string;
  reps?: number;
  sets?: number;
  durationSeconds?: number;
  restSeconds?: number;
};

export type WorkoutSet = {
  id: string;
  name: string;
  exercises: Exercise[];
};

export type WorkoutDay = {
  id: string;
  dayNumber: number;
  title: string;
  sets: WorkoutSet[];
};

export type WorkoutPlan = {
  id: string;
  title: string;
  days: WorkoutDay[];
};

export type ExerciseFeedback = {
  exerciseId: string;
  difficulty: "too_easy" | "good" | "too_hard" | "pain";
  notes?: string;
};

// --- Mock Data ---

const MOCK_WORKOUT: WorkoutPlan = {
  id: "wp_1",
  title: "Phase 1: Knee Rehab & Strengthening",
  days: [
    {
      id: "day_1",
      dayNumber: 1,
      title: "Lower Body Mobility & Activation",
      sets: [
        {
          id: "set_1",
          name: "Warmup Set",
          exercises: [
            { id: "ex_1", name: "Bodyweight Squats", description: "Keep weight in heels.", reps: 15, sets: 1, videoUrl: "https://example.com/squat.mp4" },
            { id: "ex_2", name: "Glute Bridges", description: "Squeeze glutes at the top.", reps: 12, sets: 1, videoUrl: "https://example.com/bridge.mp4" },
          ]
        },
        {
          id: "set_2",
          name: "Main Block",
          exercises: [
            { id: "ex_3", name: "Walking Lunges", description: "Maintain upright posture.", reps: 10, sets: 2 },
            { id: "ex_4", name: "Wall Sit", description: "Hold for time.", durationSeconds: 45, sets: 2 },
          ]
        }
      ]
    }
  ]
};

// --- Components ---

export function WorkoutSystem({ plan = MOCK_WORKOUT }: { plan?: WorkoutPlan }) {
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [mode, setMode] = useState<"dashboard" | "workout">("dashboard");
  
  const activeDay = plan.days[activeDayIndex];

  // Flatten exercises for the guided workout flow
  const flatExercises = React.useMemo(() => {
    if (!activeDay) return [];
    return activeDay.sets.flatMap(set => 
      set.exercises.map(ex => ({ ...ex, setName: set.name }))
    );
  }, [activeDay]);

  if (!activeDay) {
    return <div className="p-8 text-center text-muted-foreground">No active workout day found.</div>;
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-muted/50 min-h-[600px] rounded-xl shadow-lg border border-border overflow-hidden">
      {mode === "dashboard" ? (
        <DashboardView 
          day={activeDay} 
          onStart={() => setMode("workout")} 
        />
      ) : (
        <GuidedWorkoutFlow 
          exercises={flatExercises} 
          onExit={() => setMode("dashboard")} 
          onComplete={() => setMode("dashboard")} 
        />
      )}
    </div>
  );
}

// 1. Quick View Dashboard
function DashboardView({ day, onStart }: { day: WorkoutDay, onStart: () => void }) {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const totalExercises = day.sets.reduce((acc, set) => acc + set.exercises.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-border px-6 py-8">
        <h1 className="text-2xl font-bold text-foreground">Day {day.dayNumber}: {day.title}</h1>
        <p className="text-muted-foreground mt-2 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          {totalExercises} Exercises total
        </p>
        <button 
          onClick={onStart}
          className="mt-6 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors w-full sm:w-auto"
        >
          <Play className="w-5 h-5 fill-current" />
          Start Guided Workout
        </button>
      </div>

      {/* Content: Stacked Sets and Exercises */}
      <div className="flex-1 p-6 space-y-8 overflow-y-auto">
        {day.sets.map((set, index) => (
          <div key={set.id} className="space-y-4">
            <h3 className="text-lg font-bold text-muted-foreground border-b border-border pb-2">
              {set.name}
            </h3>
            <div className="grid gap-4">
              {set.exercises.map((ex) => (
                <div key={ex.id} className="bg-white p-4 rounded-xl shadow-sm border border-border/60 flex items-start gap-4 hover:border-blue-200 transition-colors">
                  <div className="bg-blue-50 text-blue-600 p-3 rounded-lg cursor-pointer hover:bg-blue-100" onClick={() => ex.videoUrl && setSelectedVideo(ex.videoUrl)}>
                    <Video className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground">{ex.name}</h4>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{ex.description}</p>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    {ex.reps && <div className="text-sm font-medium text-muted-foreground">{ex.sets} × {ex.reps} reps</div>}
                    {ex.durationSeconds && <div className="text-sm font-medium text-muted-foreground">{ex.durationSeconds} sec</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Video Modal Placeholder */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg">Exercise Video</h3>
              <button onClick={() => setSelectedVideo(null)} className="p-2 hover:bg-muted/50 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video bg-foreground/90 flex items-center justify-center text-muted-foreground/60">
              <Play className="w-16 h-16 opacity-50" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 2 & 3 & 4. Workout Mode, Completion, Feedback & Smart Adaptive UI
function GuidedWorkoutFlow({ 
  exercises, 
  onExit,
  onComplete 
}: { 
  exercises: (Exercise & { setName: string })[], 
  onExit: () => void,
  onComplete: () => void
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedbacks, setFeedbacks] = useState<Record<string, ExerciseFeedback>>({});
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const activeExercise = exercises[currentIndex];
  const progressPercent = ((currentIndex) / exercises.length) * 100;
  const isLast = currentIndex === exercises.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentIndex(prev => prev + 1);
      setShowFeedbackModal(false);
    }
  };

  const saveFeedback = (difficulty: ExerciseFeedback["difficulty"], notes?: string) => {
    setFeedbacks(prev => ({
      ...prev,
      [activeExercise.id]: { exerciseId: activeExercise.id, difficulty, notes }
    }));
    handleNext();
  };

  if (!activeExercise) return null;

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Top Header & Progress */}
      <div className="px-6 py-4 flex items-center gap-4 border-b border-border/60">
        <button onClick={onExit} className="p-2 -ml-2 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 rounded-full">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            <span>{activeExercise.setName}</span>
            <span>{currentIndex + 1} / {exercises.length}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-500 ease-out" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Focus Area */}
      <div className="flex-1 overflow-y-auto pb-32">
        {/* Big Video Player Area */}
        <div className="w-full aspect-video bg-foreground/90 relative group flex flex-col items-center justify-center text-white">
          <Video className="w-16 h-16 mb-4 opacity-50 text-blue-400" />
          <p className="text-muted-foreground/60 font-medium">Video Player Placeholder</p>
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-blue-600/90 flex items-center justify-center cursor-pointer hover:bg-blue-500 hover:scale-105 transition-all">
              <Play className="w-8 h-8 fill-current ml-1" />
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-8 max-w-2xl mx-auto space-y-6">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{activeExercise.name}</h2>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-6">
              {activeExercise.reps && (
                <div className="bg-blue-50 text-blue-800 px-4 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center min-w-[100px] sm:min-w-[120px]">
                  <span className="text-sm font-medium opacity-80 uppercase tracking-widest mb-1">Sets</span>
                  <span className="text-3xl font-black">{activeExercise.sets || 1}</span>
                </div>
              )}
              {activeExercise.reps && (
                <div className="bg-blue-50 text-blue-800 px-4 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center min-w-[100px] sm:min-w-[120px]">
                  <span className="text-sm font-medium opacity-80 uppercase tracking-widest mb-1">Reps</span>
                  <span className="text-3xl font-black">{activeExercise.reps}</span>
                </div>
              )}
              {activeExercise.durationSeconds && (
                <div className="bg-orange-50 text-orange-800 px-4 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center min-w-[100px] sm:min-w-[120px]">
                  <span className="text-sm font-medium opacity-80 uppercase tracking-widest mb-1">Duration</span>
                  <span className="text-3xl font-black">{activeExercise.durationSeconds}s</span>
                </div>
              )}
            </div>
            
            <p className="text-muted-foreground mt-6 text-lg max-w-lg mx-auto leading-relaxed">
              {activeExercise.description}
            </p>
          </div>
        </div>
      </div>

      {/* Smart Adaptive UI & Bottom Controls */}
      <div className="absolute bottom-0 inset-x-0 bg-white border-t border-border p-4 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
        {showFeedbackModal ? (
          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 space-y-4">
            <h4 className="font-semibold text-center text-foreground">How was that?</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button onClick={() => saveFeedback("too_easy")} className="flex flex-col items-center p-3 rounded-xl border border-border hover:bg-green-50 hover:border-green-200 hover:text-green-700 transition">
                <ThumbsUp className="w-5 h-5 mb-2" />
                <span className="text-sm font-medium">Too Easy</span>
                <span className="text-xs opacity-60 mt-1 text-center">Need harder progression</span>
              </button>
              <button onClick={() => saveFeedback("good")} className="flex flex-col items-center p-3 rounded-xl border border-border hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition bg-muted/50">
                <CheckCircle2 className="w-5 h-5 mb-2" />
                <span className="text-sm font-medium">Just Right</span>
                <span className="text-xs opacity-60 mt-1 text-center">Perfect difficulty</span>
              </button>
              <button onClick={() => saveFeedback("too_hard")} className="flex flex-col items-center p-3 rounded-xl border border-border hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition">
                <ThumbsDown className="w-5 h-5 mb-2" />
                <span className="text-sm font-medium">Too Hard</span>
                <span className="text-xs opacity-60 mt-1 text-center">Need easier modification</span>
              </button>
              <button onClick={() => saveFeedback("pain")} className="flex flex-col items-center p-3 rounded-xl border border-border hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition">
                <AlertTriangle className="w-5 h-5 mb-2" />
                <span className="text-sm font-medium">Painful</span>
                <span className="text-xs opacity-60 mt-1 text-center">Sharp joint pain</span>
              </button>
            </div>
            <button 
              onClick={() => setShowFeedbackModal(false)}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground text-center"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <button 
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="p-4 rounded-xl text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>

            <button 
              onClick={() => setShowFeedbackModal(true)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 px-8 rounded-xl font-bold text-lg shadow-lg shadow-blue-200 transition flex items-center justify-center gap-3"
            >
              <CheckCircle2 className="w-6 h-6" />
              Complete Exercise
            </button>

            <button 
              onClick={handleNext}
              className="p-4 rounded-xl text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition flex items-center gap-2 font-medium"
            >
              Skip
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
