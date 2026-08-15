import { describe, it, expect } from 'vitest'
import { hasRealVideoUrl, buildYouTubeSearchUrl, parseYoutubeUrls } from '../video'

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

describe('parseYoutubeUrls', () => {
  it('splits newline-separated URLs into a list', () => {
    const input = 'https://www.youtube.com/watch?v=abc123\nhttps://youtu.be/def456'
    expect(parseYoutubeUrls(input)).toEqual([
      'https://www.youtube.com/watch?v=abc123',
      'https://youtu.be/def456',
    ])
  })

  it('splits comma- or whitespace-separated URLs on the same line', () => {
    const input = 'https://youtu.be/abc123, https://youtu.be/def456'
    expect(parseYoutubeUrls(input)).toEqual([
      'https://youtu.be/abc123',
      'https://youtu.be/def456',
    ])
  })

  it('filters out non-YouTube URLs and stray text', () => {
    const input = 'https://youtu.be/abc123\nnot a url\nhttps://vimeo.com/12345'
    expect(parseYoutubeUrls(input)).toEqual(['https://youtu.be/abc123'])
  })

  it('filters out YouTube playlist URLs', () => {
    const input = 'https://youtu.be/abc123\nhttps://www.youtube.com/playlist?list=PLxyz'
    expect(parseYoutubeUrls(input)).toEqual(['https://youtu.be/abc123'])
  })

  it('returns an empty array for blank input', () => {
    expect(parseYoutubeUrls('')).toEqual([])
    expect(parseYoutubeUrls('   ')).toEqual([])
  })
})
