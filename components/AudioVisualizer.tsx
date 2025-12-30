import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  color?: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser, isActive, color = '#3b82f6' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive || !analyser || !canvasRef.current) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    let animationFrameId: number;

    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerY = canvas.height / 2;
      const barCount = 40; 
      const barWidth = canvas.width / barCount;
      const spacing = 2;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const dataIdx = i * step;
        let barHeight = (dataArray[dataIdx] / 255) * (canvas.height * 0.8);
        if (barHeight < 2) barHeight = 2;

        const x = i * barWidth;
        const gradient = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
        gradient.addColorStop(0, `${color}00`); 
        gradient.addColorStop(0.5, color);      
        gradient.addColorStop(1, `${color}00`); 

        ctx.fillStyle = gradient;
        const radius = (barWidth - spacing) / 2;
        
        ctx.beginPath();
        const rectX = x + spacing / 2;
        const rectY = centerY - barHeight / 2;
        const rectW = barWidth - spacing;
        const rectH = barHeight;
        
        ctx.roundRect(rectX, rectY, rectW, rectH, radius);
        ctx.fill();

        if (barHeight > 15) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = color;
        } else {
          ctx.shadowBlur = 0;
        }
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyser, isActive, color]);

  return (
    <div className="relative w-full group">
      <canvas 
        ref={canvasRef} 
        width={600} 
        height={80} 
        className="w-full h-16 transition-opacity duration-500"
        style={{ opacity: isActive ? 1 : 0.2 }}
      />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-[1px] w-full bg-slate-200 dark:bg-slate-800 opacity-50"></div>
        </div>
      )}
    </div>
  );
};

export default AudioVisualizer;