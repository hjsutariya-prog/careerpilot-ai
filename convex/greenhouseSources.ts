export type GreenhouseSource = {
  token: string;
  companyName: string;
};

export const greenhouseSources: readonly GreenhouseSource[] = [
  { token: "gitlab", companyName: "GitLab" },
  { token: "gleanwork", companyName: "Glean" },
  { token: "redwoodsoftware", companyName: "Redwood Software" },
  { token: "singlestore", companyName: "SingleStore" },
  { token: "eudia", companyName: "Eudia" },
  { token: "xometry", companyName: "Xometry" },
  { token: "turing", companyName: "Turing" },
  { token: "vonage", companyName: "Vonage" },
  { token: "forwardnetworks", companyName: "Forward Networks" },
  { token: "starburst", companyName: "Starburst" },
];
