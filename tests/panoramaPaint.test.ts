// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { panoramaPaint } from '../src/panoramaPaint';
let root: HTMLDivElement;
beforeEach(() => {
 vi.useFakeTimers();
 vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
 vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
 root = document.createElement('div'); document.body.append(root);
});
afterEach(() => { root.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('waits for visible images before letting a timed round start', async () => {
 const img = document.createElement('img'); root.append(img);
 let complete=false;
 Object.defineProperty(img,'complete',{get:()=>complete});
 vi.spyOn(img,'getBoundingClientRect').mockReturnValue({width:100} as DOMRect);
 const ready=vi.fn(); const task=panoramaPaint(root,new AbortController().signal).then(ready);
 await vi.advanceTimersByTimeAsync(1500); expect(ready).not.toHaveBeenCalled();
 complete=true; img.dispatchEvent(new Event('load'));
 await vi.advanceTimersByTimeAsync(900); await task; expect(ready).toHaveBeenCalledTimes(1);
});
it('cancels an old panorama without starting its timer', async () => {
 const controller=new AbortController();
 const task=panoramaPaint(root,controller.signal);
 const check=expect(task).rejects.toThrow('Cancelled'); controller.abort(); await check;
 await vi.advanceTimersByTimeAsync(15000); expect(vi.getTimerCount()).toBe(0);
});
it('fails a stuck image gate so the screen can offer retry', async () => {
 const img=document.createElement('img'); root.append(img);
 Object.defineProperty(img,'complete',{value:false});
 vi.spyOn(img,'getBoundingClientRect').mockReturnValue({width:100} as DOMRect);
 const task=panoramaPaint(root,new AbortController().signal);
 const check=expect(task).rejects.toThrow('Panorama paint timeout');
 await vi.advanceTimersByTimeAsync(12000); await check;
});
