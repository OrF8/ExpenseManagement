import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import ExcelJS from 'exceljs';
const register=async page=>{
 await page.goto('/auth');await page.getByRole('button',{name:'הרשמה',exact:true}).click();
 await page.getByLabel('אימייל',{exact:true}).fill(`nested-${Date.now()}@example.test`);
 await page.getByLabel('כינוי',{exact:true}).fill('Nested Tester');await page.getByLabel('סיסמה',{exact:true}).fill('Testing123!');
 await page.getByRole('button',{name:'הירשם',exact:true}).click();await expect(page).toHaveURL(/\/boards$/);
};
const add=async(page,name,amount,currency='ILS')=>{
 await page.getByRole('button',{name:'עסקה חדשה',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('שם',{exact:true}).fill('Tester');await dialog.getByLabel('שם העסק',{exact:true}).fill(name);
 await dialog.getByLabel('סוג עסקה',{exact:true}).selectOption('cash');await dialog.getByLabel('סכום',{exact:true}).fill(amount);
 await dialog.getByLabel('מטבע העסקה',{exact:true}).selectOption(currency);
 await dialog.getByRole('button',{name:'הוסף עסקה',exact:true}).click();await expect(dialog).not.toBeVisible();
};
const child=async(page,name,currency='ILS')=>{
 const before=page.url();await page.getByRole('button',{name:'הוסף לוח-משנה',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('שם הלוח החדש').fill(name);await dialog.getByLabel('מטבע לוח המשנה',{exact:true}).selectOption(currency);
 await dialog.getByRole('button',{name:'צור ופתח',exact:true}).click();await expect(page).not.toHaveURL(before);await expect(dialog).not.toBeVisible();
 return page.url();
};
test('desktop and mobile: create deep boards, direct/recursive scope, breadcrumbs, selectors, movement, export and deletion guard',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await register(page);
 await page.getByRole('button',{name:'לוח חדש',exact:true}).click();let dialog=page.getByRole('dialog');
 await dialog.getByLabel('שם הלוח',{exact:true}).fill('Trips');await dialog.getByRole('button',{name:'צור לוח',exact:true}).click();
 await page.getByText('Trips',{exact:true}).click();await expect(page).toHaveURL(/\/board\//);const root=page.url();
 await add(page,'Root expense','10');
 const belgrade=await child(page,'Belgrade 2026');const food=await child(page,'Food','USD');await add(page,'USD food','2','USD');
 const restaurants=await child(page,'Restaurants','RSD');await add(page,'RSD dinner','100','RSD');
 const leaf=await child(page,'Receipts');await page.reload();
 await expect(page.getByRole('heading',{name:'Receipts',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 const nav=page.getByRole('navigation',{name:'מיקום הלוח'});await nav.locator('summary').click();
 await expect(nav.getByRole('link',{name:'Trips',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await mkdir('docs/screenshots',{recursive:true});await page.screenshot({path:'docs/screenshots/nested-mobile-deep.png',fullPage:true});
 await nav.getByRole('link',{name:'Trips',exact:true}).click();await expect(page).toHaveURL(root);
 await expect(page.getByRole('heading',{name:'Belgrade 2026',exact:true})).toBeVisible();
 await expect(page.getByTestId('transaction-card')).toHaveCount(1);
 await page.getByRole('button',{name:'מחק לוח',exact:true}).click();
 await expect(page.getByText('יש להעביר או למחוק את לוחות המשנה לפני מחיקת הלוח')).toBeVisible();
 await child(page,'Food'); await page.goto(root);
 await page.getByLabel('כלול לוחות-משנה בסיכום ובייצוא').check();
 const summary=page.locator('section').filter({has:page.getByLabel('כלול לוחות-משנה בסיכום ובייצוא')});
 await expect(summary).toContainText('10.00');await expect(summary).toContainText('2.00');await expect(summary).toContainText('100.00');
 await expect(page.getByTestId('transaction-card')).toHaveCount(1);
 await page.screenshot({path:'docs/screenshots/nested-mobile-parent.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'docs/screenshots/nested-desktop-parent.png',fullPage:true});
 // Export scope matches the checkbox, with exact currency columns and all levels.
 await page.addScriptTag({path:'node_modules/exceljs/dist/exceljs.min.js'});
 const allDownload=page.waitForEvent('download');await page.getByRole('button',{name:'ייצוא לאקסל',exact:true}).click();
 const allBook=new ExcelJS.Workbook();await allBook.xlsx.readFile(await (await allDownload).path());
 expect(allBook.worksheets).toHaveLength(7);
 expect(allBook.worksheets[0].getColumn(1).values.join(' ')).toContain('Trips / Belgrade 2026 / Food / Restaurants / Receipts');
 await page.getByLabel('כלול לוחות-משנה בסיכום ובייצוא').uncheck();
 const directDownload=page.waitForEvent('download');await page.getByRole('button',{name:'ייצוא לאקסל',exact:true}).click();
 const directBook=new ExcelJS.Workbook();await directBook.xlsx.readFile(await (await directDownload).path());expect(directBook.worksheets).toHaveLength(1);
 // Direct filters keep excluding descendant transactions.
 await page.getByRole('button',{name:/סינון/}).click();await page.getByPlaceholder('הקלד כדי לחפש...').fill('USD food');
 await expect(page.getByTestId('transaction-card')).toHaveCount(0);await page.getByPlaceholder('הקלד כדי לחפש...').fill('');
 // Destination labels include full paths; every board is a valid destination.
 await page.getByTestId('transaction-card').getByRole('button',{name:'שכפל עסקה',exact:true}).click();dialog=page.getByRole('dialog');
 await page.setViewportSize({width:390,height:844});
 await expect(dialog.getByRole('checkbox',{name:'Trips / Food',exact:true})).toBeVisible();
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await page.screenshot({path:'docs/screenshots/nested-mobile-selector.png',fullPage:true});
 await expect(dialog).toContainText('Trips / Belgrade 2026 / Food / Restaurants / Receipts');
 await dialog.getByRole('checkbox',{name:'Trips / Belgrade 2026 / Food / Restaurants / Receipts',exact:true}).check();
 await dialog.getByRole('button',{name:'שכפל',exact:true}).click();await expect(dialog).not.toBeVisible();
 await page.setViewportSize({width:1280,height:900});
 await page.goto(leaf);await expect(page.getByTestId('transaction-card')).toHaveCount(1);
 // Move an entire subtree to root using existing action patterns.
 await page.getByRole('button',{name:'פעולות לוח',exact:true}).click();await page.getByRole('menuitem',{name:'העבר תחת לוח'}).click();
 dialog=page.getByRole('dialog');page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'העבר לרמה הראשית'}).click();await expect(dialog).not.toBeVisible();
 await expect(page.getByRole('navigation',{name:'מיקום הלוח'}).getByRole('link')).toHaveCount(1);
 await page.goto('/boards');
 const trips=page.locator('[draggable]').filter({has:page.getByRole('heading',{name:'Trips',exact:true})});
 await trips.getByRole('button',{name:'מחק',exact:true}).click();await expect(page.getByText('יש להעביר או למחוק את לוחות המשנה לפני מחיקת הלוח')).toBeVisible();
 await page.goto(leaf);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'מחק לוח',exact:true}).click();await expect(page).toHaveURL(/\/boards$/);
 expect(errors).toEqual([]);
 expect(new Set([root,belgrade,food,restaurants,leaf]).size).toBe(5);
});
