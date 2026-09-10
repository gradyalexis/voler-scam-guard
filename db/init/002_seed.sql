-- Seed whitelist domain umum supaya link normal (gif, media discord, marketplace
-- besar) tidak perlu round-trip ke Safe Browsing tiap kali.
INSERT INTO whitelist_domains (domain, note, added_by) VALUES
  ('discord.com',        'Discord official',        'seed'),
  ('discordapp.com',     'Discord CDN legacy',      'seed'),
  ('discord.gg',         'Discord invite',          'seed'),
  ('tenor.com',          'GIF',                     'seed'),
  ('giphy.com',          'GIF',                     'seed'),
  ('youtube.com',        'Video',                   'seed'),
  ('youtu.be',           'Video',                   'seed'),
  ('twitter.com',        'Social',                  'seed'),
  ('x.com',              'Social',                  'seed'),
  ('github.com',         'Dev',                     'seed'),
  ('imgur.com',          'Image host',              'seed'),
  ('tokopedia.com',      'Marketplace ID',          'seed'),
  ('shopee.co.id',       'Marketplace ID',          'seed'),
  ('itemku.com',         'Marketplace game ID',     'seed')
ON CONFLICT (domain) DO NOTHING;
