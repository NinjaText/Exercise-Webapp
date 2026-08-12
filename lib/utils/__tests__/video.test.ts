import { describe, it, expect } from 'vitest'
import { hasRealVideoUrl, buildYouTubeSearchUrl } from '../video'

it('returns false for a YouTube search-results URL', () => {
  expect(hasRealVideoUrl(buildYouTubeSearchUrl('brisk walk'))).toBe(false)
})

it('returns true for a real YouTube watch URL', () => {
  expect(hasRealVideoUrl('https://www.youtube.com/watch?v=abc123')).toBe(true)
})

it('returns false for null/empty', () => {
  expect(hasRealVideoUrl(null)).toBe(false)
  expect(hasRealVideoUrl('')).toBe(false)
})
