
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  color?: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser, isActive, color = '#3b82f6' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const barCount = 60;
    const bufferLength = analyser ? analyser.frequencyBinCount : 0;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);
      
      if (isActive && analyser) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        // Clear data when not active to show baseline
        dataArray.fill(0);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const spacing = 3;
      const barWidth = (canvas.width / barCount) - spacing;
      const step = bufferLength > 0 ? Math.floor(bufferLength / barCount) : 1;
      const centerY = canvas.height / 2;

      for (let i = 0; i < barCount; i++) {
        const dataIdx = i * step;
        // Normalize and scale height. 
        // We use a baseline height of ~6px to make it look "full" even when silent.
        let barHeight = (dataArray[dataIdx] / 255) * (canvas.height * 0.9);
        
        // Aesthetic "resting" state bars
        const minHeight = 6;
        if (barHeight < minHeight) {
          // Add a tiny bit of random jitter for the resting state to look "alive"
          barHeight = minHeight + (isActive ? Math.random() * 2 : 0);
        }

        const x = i * (barWidth + spacing);
        const y = centerY - (barHeight / 2);

        // Simple but high-end look
        ctx.fillStyle = color;
        // Reduce opacity if inactive
        ctx.globalAlpha = isActive ? 1.0 : 0.2;
        
        // Draw centered rounded bar
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        } else {
          // Fallback for older browsers
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
        
        // Subtle glow only when active and reacting to sound
        if (isActive && barHeight > 20) {
          ctx.save();
          ctx.shadowBlur = 10;
          ctx.shadowColor = color;
          ctx.globalAlpha = 0.4;
          ctx.fill();
          ctx.restore();
        }
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyser, isActive, color]);

  return (
    <div className="relative w-full overflow-hidden py-4">
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={100} 
        className="w-full h-24 transition-all duration-500 ease-in-out"
        style={{ 
          filter: isActive ? 'none' : 'grayscale(0.5) opacity(0.5)'
        }}
      />
    </div>
  );
};

export default AudioVisualizer;
