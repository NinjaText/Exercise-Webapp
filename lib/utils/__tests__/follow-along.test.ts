import { describe, it, expect } from 'vitest'
import {
  isFollowAlongProgram,
  isVideoWorkout,
  getYouTubeVideoId,
  dayNumberFromIndices,
  indicesFromDayNumber,
  getFollowAlongTotalDays,
  formatDayOfTotal,
  FEELING_OPTIONS,
  getFeelingLabel,
  isFeelingRating,
  formatDuration,
  formatClock,
  formatFollowAlongMetaLine,
  watchedSecondsToMinutes,
} from '../follow-along'

describe('isFollowAlongProgram', () => {
  it('is true only for contentFormat FOLLOW_ALONG', () => {
    expect(isFollowAlongProgram({ contentFormat: 'FOLLOW_ALONG' })).toBe(true)
    expect(isFollowAlongProgram({ contentFormat: null })).toBe(false)
    expect(isFollowAlongProgram({})).toBe(false)
    expect(isFollowAlongProgram(null)).toBe(false)
    expect(isFollowAlongProgram({ contentFormat: 'follow_along' })).toBe(false)
  })
})

describe('getYouTubeVideoId', () => {
  it('only reads ids from YouTube hosts', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/watch?v=abc123')).toBe('abc123')
    expect(getYouTubeVideoId('https://youtu.be/abc123')).toBe('abc123')
    expect(getYouTubeVideoId('https://media.example.com/follow-along/a.mp4?v=abc123')).toBeNull()
    expect(getYouTubeVideoId(null)).toBeNull()
  })
})

describe('isVideoWorkout', () => {
  it('requires a non-blank videoUrl', () => {
    expect(isVideoWorkout({ videoUrl: 'https://cdn.example.com/a.mp4' })).toBe(true)
    expect(isVideoWorkout({ videoUrl: '   ' })).toBe(false)
    expect(isVideoWorkout({ videoUrl: null })).toBe(false)
    expect(isVideoWorkout(undefined)).toBe(false)
  })
})

describe('day number ↔ week/day index', () => {
  it('maps Day 1 to week 0 day 0 and Day 8 to week 1 day 0', () => {
    expect(indicesFromDayNumber(1)).toEqual({ weekIndex: 0, dayIndex: 0, orderIndex: 0 })
    expect(indicesFromDayNumber(7)).toEqual({ weekIndex: 0, dayIndex: 6, orderIndex: 6 })
    expect(indicesFromDayNumber(8)).toEqual({ weekIndex: 1, dayIndex: 0, orderIndex: 7 })
    expect(indicesFromDayNumber(365)).toEqual({ weekIndex: 52, dayIndex: 0, orderIndex: 364 })
  })

  it('round-trips every day in a year', () => {
    for (let day = 1; day <= 365; day++) {
      const { weekIndex, dayIndex } = indicesFromDayNumber(day)
      expect(dayNumberFromIndices(weekIndex, dayIndex)).toBe(day)
    }
  })

  it('rejects non-positive or fractional day numbers', () => {
    expect(() => indicesFromDayNumber(0)).toThrow(RangeError)
    expect(() => indicesFromDayNumber(1.5)).toThrow(RangeError)
  })
})

describe('getFollowAlongTotalDays / formatDayOfTotal', () => {
  it('uses the last day that has a workout', () => {
    expect(getFollowAlongTotalDays([])).toBe(0)
    expect(
      getFollowAlongTotalDays([
        { weekIndex: 0, dayIndex: 0 },
        { weekIndex: 12, dayIndex: 5 },
        { weekIndex: 3, dayIndex: 2 },
      ])
    ).toBe(90)
  })

  it('keeps trailing rest weeks via durationWeeks and stays exact when the last video is in the final week', () => {
    const lastDay90 = [{ weekIndex: 12, dayIndex: 5 }]
    expect(getFollowAlongTotalDays(lastDay90, 13)).toBe(90)
    // 30-day program whose last 2 weeks are rest: last video on day 16, durationWeeks 5.
    expect(getFollowAlongTotalDays([{ weekIndex: 2, dayIndex: 1 }], 5)).toBe(35)
    expect(getFollowAlongTotalDays([{ weekIndex: 2, dayIndex: 1 }], null)).toBe(16)
    // Capped at the follow-along maximum.
    expect(getFollowAlongTotalDays([{ weekIndex: 0, dayIndex: 0 }], 60)).toBe(365)
  })

  it('formats "Day N of M" and drops an unknown or inconsistent total', () => {
    expect(formatDayOfTotal(12, 90)).toBe('Day 12 of 90')
    expect(formatDayOfTotal(12, null)).toBe('Day 12')
    expect(formatDayOfTotal(12, 5)).toBe('Day 12')
  })
})

describe('feeling ratings', () => {
  it('lists the five faces in hardest → best order with spec labels', () => {
    expect(FEELING_OPTIONS.map((o) => o.label)).toEqual(['Hard', 'Challenging', 'Just right', 'Easy', 'Great'])
  })

  it('labels known values and ignores unknown ones', () => {
    expect(getFeelingLabel('JUST_RIGHT')).toBe('Just right')
    expect(getFeelingLabel('MEH')).toBeNull()
    expect(getFeelingLabel(null)).toBeNull()
    expect(isFeelingRating('GREAT')).toBe(true)
    expect(isFeelingRating(3)).toBe(false)
  })
})

describe('durations', () => {
  it('formats video durations for cards', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(0)).toBeNull()
    expect(formatDuration(45)).toBe('45 sec')
    expect(formatDuration(900)).toBe('15 min')
    expect(formatDuration(929)).toBe('15 min')
    expect(formatDuration(3600)).toBe('1 h')
    expect(formatDuration(3900)).toBe('1 h 5 min')
  })

  it('formats the countdown clock', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-5)).toBe('0:00')
    expect(formatClock(845.7)).toBe('14:05')
    expect(formatClock(3729)).toBe('1:02:09')
    expect(formatClock(Number.NaN)).toBe('0:00')
  })

  it('builds the follow-along meta line', () => {
    expect(formatFollowAlongMetaLine(900)).toBe('Follow-along · 15 min')
    expect(formatFollowAlongMetaLine(null)).toBe('Follow-along')
  })

  it('converts watched seconds to at least one minute once anything played', () => {
    expect(watchedSecondsToMinutes(0)).toBe(0)
    expect(watchedSecondsToMinutes(10)).toBe(1)
    expect(watchedSecondsToMinutes(899)).toBe(15)
  })
})

describe('formatWorkoutMetaLine with a video workout', () => {
  it('shows the follow-along line instead of "0 exercises"', async () => {
    const { formatWorkoutMetaLine } = await import('../workout-format')
    expect(formatWorkoutMetaLine(null, 0, { videoUrl: 'https://youtu.be/abc', videoDurationSec: 900 })).toBe(
      'Follow-along · 15 min'
    )
    expect(formatWorkoutMetaLine(40, 10, { videoUrl: null })).toBe('~40 min • 10 exercises')
  })
})

describe('formatDayLabel with a video workout', () => {
  it('numbers follow-along days across the whole run', async () => {
    const { formatDayLabel } = await import('../workout-format')
    expect(
      formatDayLabel({
        weekIndex: 1,
        dayIndex: 4,
        name: 'Mobility',
        videoUrl: 'https://youtu.be/abc',
        program: { contentFormat: 'FOLLOW_ALONG' },
      })
    ).toBe('Day 12: Mobility')
    // A lone duplicated video day (ad-hoc wrapper, not follow-along) keeps the normal label.
    expect(formatDayLabel({ weekIndex: 0, dayIndex: 0, name: 'Copy', videoUrl: 'https://youtu.be/abc' })).toBe(
      'Week 1, Day 1: Copy'
    )
    expect(formatDayLabel({ weekIndex: 1, dayIndex: 4, name: 'Upper' })).toBe('Week 2, Day 5: Upper')
  })
})
