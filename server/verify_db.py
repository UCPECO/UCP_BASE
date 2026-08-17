import sqlite3
conn = sqlite3.connect(r'C:/Users/sonic/Documents/kimi/workspace/ucp_horas/server/data.sqlite')
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in c.fetchall()]
print('Tablas creadas:', len(tables))
for t in sorted(tables):
    c.execute(f'SELECT COUNT(*) FROM {t}')
    count = c.fetchone()[0]
    print(f'  {t}: {count} registros')
conn.close()
