const skillPatterns: Array<[string, RegExp]> = [
  ['React', /\breact(?:\.js)?\b/i], ['Angular', /\bangular\b/i], ['Vue.js', /\bvue(?:\.js)?\b/i], ['Next.js', /\bnext\.js\b/i],
  ['TypeScript', /\btypescript\b/i], ['JavaScript', /\bjavascript\b/i], ['HTML', /\bhtml(?:5)?\b/i], ['CSS', /\bcss(?:3)?\b/i],
  ['Java', /\bjava\b/i], ['Python', /\bpython\b/i], ['C#', /\bc#\b|\bc sharp\b/i], ['C++', /\bc\+\+\b/i], ['Go', /\bgolang\b|\bgo language\b/i],
  ['Node.js', /\bnode(?:\.js)?\b/i], ['Express.js', /\bexpress(?:\.js)?\b/i], ['Spring Boot', /\bspring boot\b/i], ['.NET', /\b\.net\b|\bdotnet\b/i],
  ['SQL', /\bsql\b/i], ['MySQL', /\bmysql\b/i], ['PostgreSQL', /\bpostgres(?:ql)?\b/i], ['MongoDB', /\bmongodb\b/i], ['Redis', /\bredis\b/i],
  ['AWS', /\baws\b|amazon web services/i], ['Azure', /\bazure\b/i], ['Google Cloud', /\bgoogle cloud\b|\bgcp\b/i],
  ['Docker', /\bdocker\b/i], ['Kubernetes', /\bkubernetes\b|\bk8s\b/i], ['Terraform', /\bterraform\b/i], ['Jenkins', /\bjenkins\b/i], ['Git', /\bgit\b/i], ['GitHub Actions', /\bgithub actions\b/i], ['CI/CD', /\bci\/?cd\b|continuous integration/i],
  ['REST APIs', /\brest(?:ful)? api(?:s)?\b/i], ['GraphQL', /\bgraphql\b/i], ['Microservices', /\bmicroservices?\b/i], ['Kafka', /\bkafka\b/i],
  ['Apache Spark', /\b(?:apache )?spark\b/i], ['Airflow', /\bairflow\b/i], ['Snowflake', /\bsnowflake\b/i], ['Power BI', /\bpower bi\b/i], ['Tableau', /\btableau\b/i],
  ['Pandas', /\bpandas\b/i], ['TensorFlow', /\btensorflow\b/i], ['PyTorch', /\bpytorch\b/i], ['Machine Learning', /\bmachine learning\b/i], ['LLMs', /\bllms?\b|large language models?/i],
  ['Figma', /\bfigma\b/i], ['Selenium', /\bselenium\b/i], ['Cypress', /\bcypress\b/i], ['Playwright', /\bplaywright\b/i], ['Jira', /\bjira\b/i],
]

export function detectResumeSkills(text: string) {
  return skillPatterns.filter(([, pattern]) => pattern.test(text)).map(([skill]) => skill).slice(0, 15)
}
