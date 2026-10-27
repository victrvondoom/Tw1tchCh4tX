import { useEffect, useRef, useState } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { eyeFeature, mapGaze, type Point, type Calibration } from './estimator';
export const CALIBRATION_POINTS = ['center', 'left', 'right', 'top', 'bottom'] as const;
export function useGaze(onPoint: (p: Point) => void) {
  const [status, setStatus] = useState('Camera off'),
    [active, setActive] = useState(false),
    [quality, setQuality] = useState('none'),
    [step, setStep] = useState(0),
    [calibrated, setCalibrated] = useState(false),
    [sensitivity, setSensitivity] = useState(1),
    [point, setPoint] = useState<Point | null>(null);
  const stream = useRef<MediaStream | null>(null),
    model = useRef<FaceLandmarker | null>(null),
    video = useRef<HTMLVideoElement | null>(null),
    frame = useRef(0),
    generation = useRef(0),
    feature = useRef<Point | null>(null),
    lastFeature = useRef(0),
    samples = useRef<Partial<Calibration>>({}),
    calibration = useRef<Calibration | null>(null),
    smooth = useRef<Point | null>(null),
    callback = useRef(onPoint),
    sensitivityRef = useRef(1);
  callback.current = onPoint;
  sensitivityRef.current = sensitivity;
  function cleanup() {
    generation.current++;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
    }
    video.current = null;
    model.current?.close();
    model.current = null;
    feature.current = null;
    calibration.current = null;
    samples.current = {};
    smooth.current = null;
  }
  function stop() {
    cleanup();
    setActive(false);
    setCalibrated(false);
    setPoint(null);
    setQuality('none');
    setStep(0);
    setStatus('Camera off · mouse and keyboard available');
  }
  useEffect(() => () => cleanup(), []);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  async function start() {
    cleanup();
    setActive(true);
    setCalibrated(false);
    setStep(0);
    setStatus('Requesting camera permission…');
    const current = generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable');
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      if (current !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setStatus('Loading local gaze model…');
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const files = await FilesetResolver.forVisionTasks('/gaze/wasm'),
        detector = await FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: '/gaze/face_landmarker.task' },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.65,
          minFacePresenceConfidence: 0.65,
          minTrackingConfidence: 0.65,
        });
      if (current !== generation.current) {
        detector.close();
        return;
      }
      model.current = detector;
      const el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      el.srcObject = media;
      video.current = el;
      await el.play();
      if (current !== generation.current) return;
      setStatus('Look at the dot, hold your head still, then capture.');
      let last = 0,
        lastVideo = -1;
      const loop = (now: number) => {
        if (current !== generation.current) return;
        if (now - last >= 80 && el.currentTime !== lastVideo) {
          last = now;
          lastVideo = el.currentTime;
          try {
            const value = eyeFeature(detector.detectForVideo(el, now).faceLandmarks[0] ?? []);
            feature.current = value;
            if (value) lastFeature.current = now;
            setQuality(value ? 'tracking' : 'low');
            if (value && calibration.current) {
              const p = mapGaze(value, calibration.current, sensitivityRef.current);
              if (p) {
                const old = smooth.current ?? p,
                  next = { x: old.x * 0.65 + p.x * 0.35, y: old.y * 0.65 + p.y * 0.35 };
                smooth.current = next;
                setPoint(next);
                callback.current(next);
              }
              setStatus('Experimental gaze active · local processing');
            }
            if (!value) {
              setPoint(null);
              setStatus('Low tracking quality · mouse fallback active');
            }
          } catch {
            stop();
            setStatus('Tracking failed · camera stopped. Mouse and keyboard available.');
            return;
          }
        }
        frame.current = requestAnimationFrame(loop);
      };
      frame.current = requestAnimationFrame(loop);
    } catch (e) {
      if (current !== generation.current) return;
      stop();
      setStatus(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Camera permission denied · mouse and keyboard remain available.'
          : 'Camera or gaze assets unavailable. Run npm run gaze:assets. Mouse and keyboard remain available.',
      );
    }
  }
  function capture() {
    const f = feature.current;
    if (!f || performance.now() - lastFeature.current > 500) {
      setStatus('No usable eye landmarks. Face the camera with both eyes open.');
      return;
    }
    const key = CALIBRATION_POINTS[step];
    if (!key) return;
    samples.current[key] = { ...f };
    if (step === 4) {
      const c = samples.current as Calibration;
      if (!mapGaze(f, c, 1)) {
        samples.current = {};
        setStep(0);
        setStatus('Calibration range too small. Try again with a still head.');
        return;
      }
      calibration.current = c;
      setCalibrated(true);
      setStatus('Experimental gaze active · local processing');
      setStep(5);
    } else setStep(step + 1);
  }
  return {
    status,
    active,
    quality,
    step,
    calibrated,
    sensitivity,
    setSensitivity,
    point,
    start,
    stop,
    capture,
  };
}
