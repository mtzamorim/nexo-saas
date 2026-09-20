import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
async function register(page: Page) {
  await page.goto('/criar-conta');
  await page.getByLabel('Seu nome', { exact: true }).fill('QA Interface');
  await page.getByLabel('Nome da equipe', { exact: true }).fill('Equipe visual');
  await page.getByLabel('E-mail', { exact: true }).fill(`qa-ui-${randomUUID()}@example.test`);
  await page.getByLabel(/^Senha/).fill('E2E-Interface-local-123!');
  await page.getByRole('button', { name: 'Criar conta gratuita' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, QA.' })).toBeVisible();
}
test('creates project and task, updates status, survives reload', async ({ page }, testInfo) => {
  await register(page);
  await page.getByRole('link', { name: 'Projetos', exact: true }).click();
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome do projeto *', { exact: true }).fill('Projeto pela interface');
  await dialog.getByRole('button', { name: 'Criar projeto', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Projeto pela interface', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir projeto' }).click();
  await page.getByRole('button', { name: 'Nova tarefa', exact: true }).click();
  await dialog.getByLabel('Título *', { exact: true }).fill('Entregar primeira versão');
  await dialog.getByLabel('Prazo', { exact: true }).fill('2028-02-29');
  await dialog.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel('Status de Entregar primeira versão', { exact: true }).selectOption('DONE');
  await expect(page.getByLabel('Status de Entregar primeira versão', { exact: true })).toHaveValue('DONE');
  await page.reload();
  await expect(page.getByLabel('Status de Entregar primeira versão', { exact: true })).toHaveValue('DONE');
  await expect(page.getByText('29/02/2028', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop-tasks.png'), fullPage: true });
});
test('mobile navigation and viewport do not overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page);
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('complementary').getByRole('link', { name: 'Projetos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projetos', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-projects.png'), fullPage: true });
});
