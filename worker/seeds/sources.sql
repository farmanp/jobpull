INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
  (
    'gh-stripe',
    'greenhouse',
    'Stripe Greenhouse',
    'https://boards-api.greenhouse.io',
    '{"boardToken":"stripe","departmentKeywords":["product"]}',
    1
  ),
  (
    'lever-netlify',
    'lever',
    'Netlify Lever',
    'https://api.lever.co',
    '{"site":"netlify","teamKeywords":["product"]}',
    0
  ),
  (
    'remoteok',
    'remote_json',
    'RemoteOK Product',
    'https://remoteok.com',
    '{"url":"https://remoteok.com/api","sourceLabel":"remoteok"}',
    1
  ),
  (
    'remotive',
    'remote_json',
    'Remotive Product',
    'https://remotive.com',
    '{"url":"https://remotive.com/api/remote-jobs","sourceLabel":"remotive"}',
    1
  ),
  (
    'arbeitnow',
    'remote_json',
    'Arbeitnow Product',
    'https://www.arbeitnow.com',
    '{"url":"https://www.arbeitnow.com/api/job-board-api","sourceLabel":"arbeitnow"}',
    1
  ),
  (
    'workingnomads',
    'remote_json',
    'Working Nomads Product',
    'https://www.workingnomads.com',
    '{"url":"https://www.workingnomads.com/jobsapi/_search?q=title:product&size=250","sourceLabel":"workingnomads","assumeRemote":true}',
    1
  );
