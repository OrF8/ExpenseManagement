import {afterEach,it,expect} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {BoardBreadcrumbs} from '../src/components/BoardBreadcrumbs';
afterEach(cleanup);
function Location(){return <output data-testid="location">{useLocation().pathname}</output>;}
it('navigates ancestors by stable IDs, with a compact deep path',()=>{
 const path=Array.from({length:12},(_,i)=>({id:`b${i}`,title:`Level ${i}`}));
 render(<MemoryRouter><BoardBreadcrumbs board={{title:'Leaf'}} path={path}/><Location/></MemoryRouter>);
 expect(screen.getByText(/12 לוחות/).tagName).toBe('SUMMARY');
 expect(document.querySelector('details').open).toBe(false);
 fireEvent.click(screen.getByText(/12 לוחות/));
 fireEvent.click(screen.getByRole('link',{name:'Level 9'}));
 expect(screen.getByTestId('location').textContent).toBe('/board/b9');
 expect(screen.getByText('Leaf').getAttribute('aria-current')).toBe('page');
});
it('shows a safe unavailable ancestor hint without leaking missing names',()=>{
 render(<MemoryRouter><BoardBreadcrumbs board={{title:'Shared leaf'}} path={[]} incomplete/></MemoryRouter>);
 expect(screen.getByText('חלק מנתיב הלוח אינו זמין')).toBeTruthy();
 expect(screen.getAllByRole('link')).toHaveLength(1);
});
