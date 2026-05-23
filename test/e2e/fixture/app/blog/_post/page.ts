/* Blog post page — SSR + loader, dynamic param `id`. */
import { defineWompo, html } from 'wompo';

function BlogPostPage({ params, data }: any) {
  return html`
    <article data-testid="post">
      <h1>Post ${params.id}</h1>
      <p>${data.body}</p>
    </article>
  `;
}

defineWompo(BlogPostPage, { name: 'fx-blog-post' });
export default BlogPostPage;
