// Local proof only; no remote target is accepted and all successful writes roll back.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {root,mustSql} from './local-test-runtime.mjs';
import {resolve} from 'node:path';
const source=readFileSync(resolve(root,'deploy/staging/fixtures.sql'),'utf8');
await assert.rejects(mustSql(source), /Staging only/);
await assert.rejects(mustSql(source.replace('begin;', "begin;\nset local matebreak.environment = 'production';")), /Staging only/);
const fixture=source.replace('begin;', "begin;\nset local matebreak.environment = 'staging';");
await mustSql(fixture.replace(/commit;\s*$/,()=> '\nDO $$ BEGIN IF (select count(*) from public.catalogo_producto where publicado)<>1 THEN RAISE EXCEPTION \'Unexpected staging publications\'; END IF; IF NOT EXISTS(select 1 from public.mb_catalogo_disponibilidad() where comprable and con_stock) THEN RAISE EXCEPTION \'No purchasable fixture\'; END IF; END $$;\nrollback;'));
console.log('PASS staging fixtures: missing/production marker rejected; synthetic catalog/stock verified and restored by rollback');
