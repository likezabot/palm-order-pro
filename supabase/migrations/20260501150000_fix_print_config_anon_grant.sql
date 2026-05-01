-- =========================================================================
-- CORREÇÃO CRÍTICA: admin_save_print_config não estava acessível para anon
--
-- O migration de hardening (20260430) fez REVOKE de todas as funções e
-- relistou apenas as permitidas. admin_save_print_config ficou de fora.
-- Resultado: savePrintConfig() falha silenciosamente para usuários anon
-- (o POS não usa auth), a config nunca chega ao banco, o desktop EXE
-- nunca sincroniza → mudanças de fonte e toggles são ignorados.
-- =========================================================================

GRANT EXECUTE ON FUNCTION public.admin_save_print_config(jsonb) TO anon, authenticated;
