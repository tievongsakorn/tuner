#THIS Project is create by AI For my Coding education perpose : Vongsakorntie

# Guitar Tuner Web Application 

A simple, accurate guitar tuner built with vanilla JavaScript using the Web Audio API. This tuner provides real-time pitch detection and visual feedback for tuning your guitar.

## Features

- Real-time pitch detection
- Visual needle indicator
- Cent deviation display
- Frequency display
- Support for standard guitar tuning (E2, A2, D3, G3, B3, E4)
- Modern, responsive design

## How to Use

1. Open `index.html` in a modern web browser (Chrome, Firefox, Safari, or Edge recommended)
2. Click the "Start Tuner" button
3. Grant microphone permissions when prompted
4. Play a note on your guitar
5. The tuner will display:
   - The detected note
   - How many cents you are off from the perfect pitch
   - The current frequency in Hz
   - A visual needle indicator showing if you need to tune up or down

## Technical Details

- Uses the Web Audio API for audio processing
- Implements auto-correlation algorithm for accurate pitch detection
- No external dependencies or frameworks required
- Works in all modern browsers that support the Web Audio API

## Browser Compatibility

- Chrome 49+
- Firefox 36+
- Safari 14.1+
- Edge 79+

## Note

For best results:
- Use in a quiet environment
- Ensure your microphone is working properly
- Allow the tuner a moment to stabilize when you start playing a note
- Keep your guitar close to the microphone
