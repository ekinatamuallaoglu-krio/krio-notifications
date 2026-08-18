export function playSound(audioContext, profile) {
  if (!audioContext || !profile || profile.sound === 'silent' || profile.volume === 0) return
  const sounds = {
    chime: [
      [660, 0, 0.16],
      [880, 0.09, 0.17],
    ],
    soft: [
      [440, 0, 0.25],
      [554, 0.12, 0.28],
    ],
    pop: [
      [760, 0, 0.09],
      [520, 0.07, 0.12],
    ],
    bell: [
      [880, 0, 0.35],
      [1320, 0.08, 0.45],
    ],
  }
  const now = audioContext.currentTime
  ;(sounds[profile.sound] || sounds.chime).forEach(([frequency, delay, duration]) => {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.frequency.value = frequency
    oscillator.type = profile.sound === 'pop' ? 'triangle' : 'sine'
    const level = Math.max(0.001, (profile.volume / 100) * 0.16)
    gain.gain.setValueAtTime(0.001, now + delay)
    gain.gain.linearRampToValueAtTime(level, now + delay + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start(now + delay)
    oscillator.stop(now + delay + duration)
  })
}
