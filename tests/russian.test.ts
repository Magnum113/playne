import { expect, it } from 'vitest';
import { counted } from '../src/russian';
it.each([[0,'ходов'],[1,'ход'],[2,'хода'],[4,'хода'],[5,'ходов'],[11,'ходов'],[14,'ходов'],[21,'ход'],[22,'хода'],[101,'ход']])('formats %i moves correctly',(n,word)=>{expect(counted(Number(n),'ход','хода','ходов')).toBe(`${n} ${word}`);});
